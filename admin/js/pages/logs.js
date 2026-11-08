// Logs: all the activity and its statistics, from the log that Silence writes
// (admin/logs/requests.log) and the panel's own entries (lib/log.js). Tabs:
//   #/logs          Activity: the requests to the student's app (its web app, its tools and the
//                   panel's tests) and the panel's actions on Silence, newest first;
//   #/logs/api      Your API: the requests to the student's endpoints, by endpoint;
//   #/logs/web      Your web app: the files of web/, by file;
//   #/logs/silence  Silence's API: what Silence gives to the app (login, register, GET /api).
// The tests count too; the panel's own requests to Silence's admin API do not. Reset deletes the
// log: the activity and the statistics start again.
import { html, json, tabs, methodBadge, statusClass, muted } from "../lib/html.js";
import { attempt, toast, needsConfirm } from "../lib/ui.js";
import { dataTable } from "../components/table.js";
import { readLog, log, logDeleted, activity, clearActivity, subscribe } from "../lib/log.js";
import { summarize } from "../lib/requestlog.js";
import { deleteFile, LOG } from "../lib/files.js";

const TABS = {
  activity: ["Activity", "The requests to your app (your web app, your tools and the tests of this panel) and what this panel "
    + "does in Silence, newest first. Open a line to see its details"],
  api: ["Your API", "The endpoints of endpoints/*.json, also when the tests call them"],
  web: ["Your web app", "The files of web/"],
  silence: ["Silence's API", "What Silence gives to your app: login, register and the API summary (GET /api)"],
};

// What to do to see something in each tab
const EMPTY = {
  api: html`No requests yet: <a href="#/endpoints">try an endpoint</a>, <a href="#/endpoints">run the tests</a> or use your web app.`,
  web: html`No requests yet: open <a href="/" target="_blank">your web app</a>.`,
  silence: "No requests yet.",
};

let unsubscribe = null;
let onlyFailures = false;

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

function line(e) {
  const summary = html`
    <span class="sa-console__time">${e.time}</span>
    <span class="sa-console__source">${e.source ?? ""}</span>
    ${e.kind === "event"
      ? html`<span class="sa-console__event">${e.message}</span>`
      : html`<span class="sa-method sa-method--${e.method}">${e.method}</span>
        <span class="sa-route">${e.path}</span>
        <span class="sa-console__status ${lineStatus(e)}">${e.status || "—"}</span>
        ${e.ms !== undefined ? html`<span class="uk-text-muted">${e.ms} ms</span>` : ""}
        ${e.message ? html`<span class="sa-console__message">${e.message}</span>` : ""}`}
    ${e.href ? html`<a class="sa-console__go" href="${e.href}" title="Go there" aria-label="Go there"
      uk-icon="icon: arrow-right; ratio: .8"></a>` : ""}`;
  const cls = `sa-console__line sa-console__line--${e.kind ?? "request"}${e.ok ? "" : " sa-console__line--fail"}`;
  const detail = e.response !== undefined && e.response !== null && e.response !== "";
  return detail
    ? html`<details class="${cls}"><summary>${summary}</summary><pre class="sa-pre">${json(e.response)}</pre></details>`
    : html`<div class="${cls}"><div class="sa-console__summary">${summary}</div></div>`;
}

function activityTab(body) {
  body.innerHTML = html`
    <div class="sa-toolbar">
      <label><input class="uk-checkbox" type="checkbox" id="only-failures" ${onlyFailures ? "checked" : ""}> Only failures</label>
      <span class="sa-toolbar__spacer"></span>
      <button class="uk-button uk-button-default uk-button-small" type="button" id="clear"
        title="Hide what has been seen until now (the statistics are kept)">Clear</button>
    </div>
    <div class="sa-console" id="lines" role="log"></div>`;
  const draw = () => {
    const all = activity();
    const shown = onlyFailures ? all.filter((e) => !e.ok) : all;
    body.querySelector("#lines").innerHTML = shown.length ? html`${[...shown].reverse().map(line)}`
      : html`<p>${all.length ? "No failures." : "Nothing yet: the requests to your app and what this panel does will appear here."}</p>`;
  };
  body.querySelector("#only-failures").addEventListener("change", (event) => {
    onlyFailures = event.target.checked;
    draw();
  });
  body.querySelector("#clear").addEventListener("click", clearActivity);
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

const failures = (n, text) => (n ? html`<span class="sa-fail">${n} ${text}</span>` : `0 ${text}`);

const ENDPOINT_COLUMNS = [
  { key: "method", label: "Method", filter: "select", render: (e) => methodBadge(e.method) },
  { key: "route", label: "Route", render: (e) => html`<span class="sa-route">${e.route}</span>` },
  { key: "requests", label: "Requests", filter: false },
  { key: "errors", label: "Errors", filter: false, render: (e) => failures(e.errors, "") },
  { key: "status", label: "Status codes", filter: false, sortable: false, render: (e) => statuses(e.byStatus) },
  { key: "avgMs", label: "Average (ms)", filter: false },
  { key: "maxMs", label: "Max (ms)", filter: false },
];

const FILE_COLUMNS = [
  { key: "path", label: "File", render: (f) => html`<span class="sa-route">${f.path}</span>` },
  { key: "kind", label: "Kind", filter: "select" },
  { key: "requests", label: "Requests", filter: false },
  { key: "notFound", label: "Not found", filter: false, render: (f) => failures(f.notFound, "") },
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

export async function render(main, app, params) {
  const tab = TABS[params[0]] ? params[0] : "activity";
  main.innerHTML = html`
    <h1>Logs</h1>
    <div class="sa-toolbar">
      <span class="uk-text-muted" id="since"></span>
      <span class="sa-toolbar__spacer"></span>
      <button class="uk-button uk-button-default" type="button" id="refresh"
        title="Read again the requests that Silence logs (also those of your web app)">Refresh</button>
      <button class="uk-button uk-button-default" type="button" id="reset"
        title="Delete the log of requests: the activity and the statistics start again">Reset</button>
    </div>
    <div id="tabs"></div>
    <p class="uk-text-muted sa-small">${TABS[tab][1]}.</p>
    <div id="tab"></div>`;

  const body = main.querySelector("#tab");
  const drawTab = tab === "activity" ? activityTab(body) : statsTab(body, tab);

  function draw() {
    const s = summarize(log().lines);
    main.querySelector("#since").textContent = s.since ? `Requests since ${new Date(s.since).toLocaleString()}` : "No requests logged yet";
    main.querySelector("#tabs").innerHTML = tabs(Object.entries(TABS).map(([key, [label]]) => ({
      key, label: key === "activity" ? label : `${label} (${s[key].requests})`,
      href: key === "activity" ? "#/logs" : `#/logs/${key}`,
    })), tab);
    drawTab(s);
  }

  main.querySelector("#refresh").addEventListener("click", readLog);
  main.querySelector("#reset").addEventListener("click", async (event) => {
    if (!needsConfirm(event.currentTarget, "Delete the log?")) return;
    await readLog();
    const { lines, etag } = log();
    if (!lines.length) return;
    if (await attempt(() => deleteFile(LOG, etag), "The log of requests has been deleted")) logDeleted();
  });
  leave();
  unsubscribe = subscribe(draw);
  draw();
  if (!await readLog()) toast("The log of requests cannot be read: is 'silence run' running?", "error");
}
