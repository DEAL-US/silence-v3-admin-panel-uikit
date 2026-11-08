// Statistics of the requests since Silence started (kept in memory by Silence), in three tabs as
// silence-dev4 groups them: the student's API, the student's web app and what Silence gives to
// the student's app (login, register, GET /api). The tests count too; the panel does not.
import { html, tabs, methodBadge, statusClass, muted } from "../lib/html.js";
import { api, quietApi } from "../lib/api.js";
import { attempt } from "../lib/ui.js";
import { dataTable } from "../components/table.js";

const GROUPS = {
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

const REFRESH_MS = 5000;
let timer = null;

export function crumbs(params) {
  return [{ label: "Statistics", href: "#/stats" }, { label: (GROUPS[params[0]] ?? GROUPS.api)[0] }];
}

export function leave() {
  clearInterval(timer);
}

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

const card = ([title, text], big, detail) => html`<div class="uk-card uk-card-default uk-card-small"><div class="uk-card-body">
  <p class="uk-text-muted uk-margin-remove">${title}</p>
  <p class="sa-big">${big}</p>
  <p class="sa-small uk-margin-remove">${detail}</p>
  <p class="sa-small uk-text-muted uk-margin-remove">${text}</p>
</div></div>`;

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

export async function render(main, app, params) {
  const tab = GROUPS[params[0]] ? params[0] : "api";
  main.innerHTML = html`
    <h1>Statistics</h1>
    <div class="sa-toolbar">
      <span class="uk-text-muted" id="since"></span>
      <span class="sa-toolbar__spacer"></span>
      <button class="uk-button uk-button-default" type="button" id="refresh">Refresh</button>
      <button class="uk-button uk-button-default" type="button" id="reset">Reset</button>
    </div>
    <div class="sa-grid" id="totals"></div>
    <div id="tabs"></div>
    <p class="uk-text-muted sa-small">${GROUPS[tab][1]}.</p>
    <div id="table"></div><div id="unmatched"></div>`;

  const table = dataTable(main.querySelector("#table"), {
    rows: [], sort: { key: "requests", dir: "desc" }, empty: EMPTY[tab],
    columns: tab === "web" ? FILE_COLUMNS : ENDPOINT_COLUMNS,
  });

  async function draw() {
    const s = await quietApi("/stats").catch(() => null);
    if (!s) return;
    main.querySelector("#since").textContent = `Since ${new Date(s.since * 1000).toLocaleString()}`;
    const apiDetail = (g) => html`${failures(g.errors, "errors")} · ${g.avgMs} ms on average`;
    const kinds = Object.entries(s.web.byKind).map(([k, n]) => ` · ${k} ${n}`).join("");
    main.querySelector("#totals").innerHTML = html`
      ${card(GROUPS.api, s.api.requests, apiDetail(s.api))}
      ${card(GROUPS.web, s.web.requests, html`${failures(s.web.notFound, "not found")} · ${bytes(s.web.bytes)}${kinds}`)}
      ${card(GROUPS.silence, s.silence.requests, apiDetail(s.silence))}`;
    main.querySelector("#tabs").innerHTML = tabs(Object.entries(GROUPS).map(([key, [label]]) =>
      ({ key, label: `${label} (${s[key].requests})`, href: `#/stats/${key}` })), tab);
    table.update(tab === "web" ? s.web.files : s[tab].endpoints);
    const unmatched = tab === "api" ? Object.entries(s.api.unmatched) : [];
    main.querySelector("#unmatched").innerHTML = unmatched.length ? html`
      <div class="uk-alert uk-alert-warning sa-small"><strong>Requests to routes without an endpoint (404)</strong>
        <ul class="uk-margin-remove">${unmatched.map(([k, n]) => html`<li><span class="sa-route">${k}</span> ×${n}</li>`)}</ul>
      </div>` : "";
  }

  main.querySelector("#refresh").addEventListener("click", draw);
  main.querySelector("#reset").addEventListener("click", async () => {
    await attempt(() => api("/stats", "DELETE"), "Statistics reset");
    draw();
  });
  await draw();
  // Refreshing while a filter is being typed would get in the way: only when not filtering
  clearInterval(timer);
  timer = setInterval(() => table.filtering() || draw(), REFRESH_MS);
}
