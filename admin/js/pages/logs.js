// Logs: all the activity and its statistics, from the log that Silence writes
// (admin/logs/requests.log) and the panel's own entries (lib/log.js). Tabs:
//   #/logs                    Activity: the requests to the student's app (its web app, its tools and
//                             the panel's tests) and the panel's actions on Silence, newest first,
//                             with filters; .../endpoint/<METHOD route> or .../file/<path>: only the
//                             requests of an endpoint or of a file (from a row of the statistics);
//   #/logs/api                Your API: the requests to the student's endpoints, by endpoint;
//   #/logs/web                Your web app: the files of web/, by file;
//   #/logs/silence            Silence's API: what Silence gives to the app (login, logout, GET /api).
// The tests count too; the panel's own requests to Silence's admin API do not. "Clear the log"
// deletes the log and the panel's entries: the activity and the statistics start again.
import { html, json, link, tabs, methodBadge, statusClass, muted, options } from "../lib/html.js";
import { attempt, toast, needsConfirm } from "../lib/ui.js";
import { dataTable } from "../components/table.js";
import { readLog, log, activity, clearAll, subscribe } from "../lib/log.js";
import { summarize } from "../lib/requestlog.js";
import { matchRoute } from "../lib/testing.js";
import { studentApi } from "../lib/student-api.js";

const TABS = {
  activity: ["Activity", "The requests to your app (your web app, your tools and the tests of this panel) and what this panel "
    + "does in Silence, newest first. Open a line to see its details"],
  api: ["Your API", "The endpoints of endpoints/*.json, also when the tests call them. Click a route to see its requests"],
  web: ["Your web app", "The files of web/. Click a file to see its requests"],
  silence: ["Silence's API", "What Silence gives to your app: login, logout and the API summary (GET /api). Click a "
    + "route to see its requests"],
};

const FROM = [["", "Everything"], ["api", "Your API"], ["web", "Your web app"], ["silence", "Silence's API"],
  ["panel", "This panel"]];

// What to do to see something in each tab
const EMPTY = {
  api: html`No requests yet: <a href="#/endpoints">try an endpoint</a>, <a href="#/endpoints">run the tests</a> or use your web app.`,
  web: html`No requests yet: open <a href="/" target="_blank">your web app</a>.`,
  silence: "No requests yet.",
};

// The filters of the activity (kept while the panel is open)
const filters = { from: "", failures: false, text: "" };

let unsubscribe = null;

export function crumbs(params) {
  const tab = TABS[params[0]] ? params[0] : "activity";
  return [{ label: "Logs", href: "#/logs" }, { label: TABS[tab][0] }];
}

export function leave() {
  unsubscribe?.();
  unsubscribe = null;
}

///////////////////////////////////////////////////////////////////////////////
// Activity
///////////////////////////////////////////////////////////////////////////////

function lineStatus(e) {
  if (!e.status || e.status >= 500) return "sa-console__status--error";
  if (e.status >= 400) return e.ok ? "sa-console__status--expected" : "sa-console__status--warn";
  return "sa-console__status--ok";
}

function summary(e) {
  return html`
    <span class="sa-console__time">${e.time}</span>
    <span class="sa-console__source">${e.source ?? ""}</span>
    ${e.kind === "request"
      ? html`<span class="sa-method sa-method--${e.method}">${e.method}</span>
        <span class="sa-route">${e.path}</span>
        <span class="sa-console__status ${lineStatus(e)}">${e.status || "—"}</span>
        ${e.ms !== undefined ? html`<span class="uk-text-muted">${e.ms} ms</span>` : ""}
        ${e.message ? html`<span class="sa-console__message">${e.message}</span>` : ""}`
      : html`<span class="sa-console__event">${e.message}</span>`}
    ${e.href ? html`<a class="sa-console__go" href="${e.href}" title="Go there" aria-label="Go there"
      uk-icon="icon: arrow-right; ratio: .8"></a>` : ""}`;
}

function line(e) {
  const cls = `sa-console__line sa-console__line--${e.kind ?? "request"}${e.ok ? "" : " sa-console__line--fail"}`;
  if (e.kind === "group") {
    return html`<details class="${cls}"><summary>${summary({ ...e, message: `${e.message} (${e.children.length} requests)` })}</summary>
      <div class="sa-console__group">${[...e.children].reverse().map(line)}</div></details>`;
  }
  const detail = e.response !== undefined && e.response !== null && e.response !== "";
  return detail
    ? html`<details class="${cls}"><summary>${summary(e)}</summary><pre class="sa-pre">${json(e.response)}</pre></details>`
    : html`<div class="${cls}"><div class="sa-console__summary">${summary(e)}</div></div>`;
}

/** Whether an entry is a request of the endpoint ("METHOD route") or of the file of the target */
function ofTarget(e, target) {
  if (!target) return true;
  if (e.kind !== "request") return false;
  const path = e.path.split("?")[0];
  if (target.kind === "file") return e.from === "web" && path === target.value;
  const [method, route] = target.value.split(" ");
  if (e.method !== method) return false;
  if (e.route) return e.route === route;
  return path.startsWith(studentApi.prefix) && matchRoute(route, path.slice(studentApi.prefix.length)) !== null;
}

/** The filters of the toolbar (from, only failures, text) */
function passes(e) {
  if (filters.from && e.from !== filters.from) return false;
  if (filters.failures && e.ok) return false;
  const text = filters.text.toLowerCase();
  return !text || [e.path, e.message, e.source].some((x) => String(x ?? "").toLowerCase().includes(text));
}

/** The entries shown: a group, if it passes or some of its requests do (then, only those inside) */
function visible(all, target) {
  const res = [];
  for (const e of all) {
    if (e.kind === "group") {
      const children = e.children.filter((c) => ofTarget(c, target) && passes(c));
      if (children.length || (!target && passes(e))) res.push({ ...e, children: children.length ? children : e.children });
    } else if (ofTarget(e, target) && passes(e)) {
      res.push(e);
    }
  }
  return res;
}

function activityTab(body, target) {
  body.innerHTML = html`
    <div class="sa-toolbar">
      <select class="uk-select uk-form-small uk-width-auto" id="from" aria-label="Show">${options(FROM, filters.from)}</select>
      <input class="uk-input uk-form-small uk-width-medium" id="text" type="search" value="${filters.text}"
        placeholder="Search (e.g. employees)" aria-label="Search">
      <label><input class="uk-checkbox" type="checkbox" id="only-failures" ${filters.failures ? "checked" : ""}> Only failures</label>
      ${target ? html`<span class="uk-label">Only ${target.value}
        <a class="uk-light" href="#/logs" aria-label="Show all" title="Show all" uk-icon="icon: close; ratio: .7"></a></span>` : ""}
    </div>
    <div class="sa-console" id="lines" role="log"></div>`;
  const draw = () => {
    const all = activity();
    const shown = visible(all, target);
    body.querySelector("#lines").innerHTML = shown.length ? html`${[...shown].reverse().map(line)}`
      : html`<p>${all.length ? "Nothing matches the filters."
        : "Nothing yet: the requests to your app and what this panel does will appear here."}</p>`;
  };
  body.querySelector("#from").addEventListener("change", (event) => {
    filters.from = event.target.value;
    draw();
  });
  body.querySelector("#text").addEventListener("input", (event) => {
    filters.text = event.target.value.trim();
    draw();
  });
  body.querySelector("#only-failures").addEventListener("change", (event) => {
    filters.failures = event.target.checked;
    draw();
  });
  return draw;
}

///////////////////////////////////////////////////////////////////////////////
// Statistics
///////////////////////////////////////////////////////////////////////////////

const statuses = (byStatus) => {
  const list = Object.entries(byStatus).sort();
  return list.length
    ? html`${list.map(([code, n]) => html`<span class="sa-status ${statusClass(Number(code))}">${code}</span>×${n} `)}`
    : muted();
};

function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const failures = (n) => (n ? html`<span class="sa-fail">${n}</span>` : "0");

const ENDPOINT_COLUMNS = [
  { key: "method", label: "Method", filter: "select", render: (e) => methodBadge(e.method) },
  { key: "route", label: "Route", render: (e) => html`<a class="sa-route" href="${link("logs", "activity", "endpoint",
    `${e.method} ${e.route}`)}" title="See its requests">${e.route}</a>` },
  { key: "requests", label: "Requests", filter: false },
  { key: "errors", label: "Errors", filter: false, render: (e) => failures(e.errors) },
  { key: "status", label: "Status codes", filter: false, sortable: false, render: (e) => statuses(e.byStatus) },
  { key: "avgMs", label: "Average (ms)", filter: false },
  { key: "maxMs", label: "Max (ms)", filter: false },
];

const FILE_COLUMNS = [
  { key: "path", label: "File", render: (f) => html`<a class="sa-route" href="${link("logs", "activity", "file", f.path)}"
    title="See its requests">${f.path}</a>` },
  { key: "kind", label: "Kind", filter: "select" },
  { key: "requests", label: "Requests", filter: false },
  { key: "notFound", label: "Not found", filter: false, render: (f) => failures(f.notFound) },
  { key: "bytes", label: "Sent", filter: false, render: (f) => bytes(f.bytes) },
];

function statsTab(body, tab) {
  body.innerHTML = html`<div id="table"></div><div id="unmatched"></div>`;
  const table = dataTable(body.querySelector("#table"), {
    rows: [], sort: { key: "requests", dir: "desc" }, empty: EMPTY[tab],
    columns: tab === "web" ? FILE_COLUMNS : ENDPOINT_COLUMNS,
  });
  return (s) => {
    table.update(tab === "web" ? s.web.files : s[tab].endpoints);
    const unmatched = tab === "api" ? Object.entries(s.api.unmatched) : [];
    body.querySelector("#unmatched").innerHTML = unmatched.length ? html`
      <div class="uk-alert uk-alert-warning sa-small"><strong>Requests to routes without an endpoint (404)</strong>
        <ul class="uk-margin-remove">${unmatched.map(([k, n]) => html`<li><span class="sa-route">${k}</span> ×${n}</li>`)}</ul>
      </div>` : "";
  };
}

///////////////////////////////////////////////////////////////////////////////
// The page
///////////////////////////////////////////////////////////////////////////////

const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export async function render(main, app, params) {
  const tab = TABS[params[0]] ? params[0] : "activity";
  const target = tab === "activity" && ["endpoint", "file"].includes(params[1]) && params[2]
    ? { kind: params[1], value: params[2] } : null;
  main.innerHTML = html`
    <h1>Logs</h1>
    <div class="sa-toolbar">
      <span id="since" role="status"></span>
      <span class="sa-toolbar__spacer"></span>
      <button class="uk-button uk-button-default" type="button" id="refresh"
        title="Read again the requests that Silence logs (also those of your web app)">Refresh</button>
      <button class="uk-button uk-button-default" type="button" id="clear"
        title="Delete the log of requests and what this panel has noted: the activity and the statistics start again">Clear the log</button>
    </div>
    <div id="tabs"></div>
    <p class="uk-text-muted sa-small">${TABS[tab][1]}.</p>
    <div id="tab"></div>`;

  const body = main.querySelector("#tab");
  const drawTab = tab === "activity" ? activityTab(body, target) : statsTab(body, tab);

  function draw() {
    const { lines } = log();
    const s = summarize(lines);
    const errors = lines.filter((l) => l.status >= 400).length;
    main.querySelector("#since").innerHTML = lines.length
      ? html`<strong>${lines.length}</strong> requests since ${time(s.since)}
        · ${errors ? html`<span class="sa-fail">${errors} with errors</span>` : "none with errors"}`
      : html`<span class="uk-text-muted">No requests logged yet</span>`;
    main.querySelector("#tabs").innerHTML = tabs(Object.entries(TABS).map(([key, [label]]) => ({
      key, label: key === "activity" ? label : `${label} (${s[key].requests})`,
      href: key === "activity" ? "#/logs" : `#/logs/${key}`,
    })), tab);
    drawTab(s);
  }

  main.querySelector("#refresh").addEventListener("click", readLog);
  main.querySelector("#clear").addEventListener("click", async (event) => {
    if (!needsConfirm(event.currentTarget, "Delete it all?")) return;
    if (await attempt(() => clearAll())) toast("The log has been cleared", "success");
  });
  leave();
  unsubscribe = subscribe(draw);
  draw();
  if (!await readLog()) toast("The log of requests cannot be read: is 'silence run' running?", "error");
}
