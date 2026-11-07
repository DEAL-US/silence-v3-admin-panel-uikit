// Statistics of the requests since Silence started (kept in memory by Silence), in three groups
// as silence-dev4 shows them: the student's API, Silence's API (login, register, the admin API)
// and the student's web app. The tests count too.
import { api, esc, attempt, method, statusClass } from "../ui.js";
import { dataTable } from "../components/table.js";

const GROUPS = {
  api: ["Your API", "The endpoints of endpoints/*.json, also when the tests call them"],
  web: ["Your web app", "The files of web/"],
  silence: ["Silence's API", "Login, register, the API summary and the admin API (this panel)"],
};

let timer = null;

export function crumbs() {
  return [{ label: "Statistics" }];
}

function statuses(byStatus) {
  const list = Object.entries(byStatus);
  return list.length
    ? list.sort().map(([code, n]) => `<span class="sa-status ${statusClass(Number(code))}">${code}</span>×${n}`).join(" ")
    : `<span class="uk-text-muted">—</span>`;
}

function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function card(title, text, big, detail) {
  return `<div class="uk-card uk-card-default uk-card-small"><div class="uk-card-body">
    <p class="uk-text-muted uk-margin-remove">${title}</p>
    <p class="sa-big">${big}</p>
    <p class="sa-small uk-margin-remove">${detail}</p>
    <p class="sa-small uk-text-muted uk-margin-remove">${text}</p>
  </div></div>`;
}

function endpointColumns() {
  return [
    { key: "method", label: "Method", filter: "select", render: (e) => method(e.method) },
    { key: "route", label: "Route", render: (e) => `<span class="sa-route">${esc(e.route)}</span>` },
    { key: "requests", label: "Requests", filter: false },
    { key: "errors", label: "Errors", filter: false,
      render: (e) => (e.errors ? `<span class="sa-fail">${e.errors}</span>` : "0") },
    { key: "status", label: "Status codes", filter: false, sortable: false, render: (e) => statuses(e.byStatus) },
    { key: "avgMs", label: "Average (ms)", filter: false },
    { key: "maxMs", label: "Max (ms)", filter: false },
  ];
}

export async function render(main) {
  main.innerHTML = `
    <h1>Statistics</h1>
    <div class="sa-toolbar">
      <span class="uk-text-muted" id="since"></span>
      <span class="sa-toolbar__spacer"></span>
      <button class="uk-button uk-button-default" type="button" id="refresh">Refresh</button>
      <button class="uk-button uk-button-default" type="button" id="reset">Reset</button>
    </div>
    <div class="sa-grid" id="totals"></div>
    <section class="sa-section"><h2>${GROUPS.api[0]}</h2><div id="api"></div><div id="api-unmatched"></div></section>
    <section class="sa-section"><h2>${GROUPS.web[0]}</h2><div id="web"></div></section>
    <section class="sa-section"><h2>${GROUPS.silence[0]}</h2><div id="silence"></div></section>`;

  const tables = {
    api: dataTable(main.querySelector("#api"), {
      rows: [], sort: { key: "requests", dir: "desc" }, empty: "No requests yet.", columns: endpointColumns() }),
    silence: dataTable(main.querySelector("#silence"), {
      rows: [], sort: { key: "requests", dir: "desc" }, empty: "No requests yet.", columns: endpointColumns() }),
    web: dataTable(main.querySelector("#web"), {
      rows: [], sort: { key: "requests", dir: "desc" }, empty: "No requests yet.",
      columns: [
        { key: "path", label: "File", render: (f) => `<span class="sa-route">${esc(f.path)}</span>` },
        { key: "kind", label: "Kind", filter: "select" },
        { key: "requests", label: "Requests", filter: false },
        { key: "notFound", label: "Not found", filter: false,
          render: (f) => (f.notFound ? `<span class="sa-fail">${f.notFound}</span>` : "0") },
        { key: "bytes", label: "Sent", filter: false, render: (f) => bytes(f.bytes) },
      ],
    }),
  };

  async function draw() {
    let s;
    try {
      s = await api("/stats");
    } catch {
      return;
    }
    main.querySelector("#since").textContent = "Since " + new Date(s.since * 1000).toLocaleString();
    const apiDetail = (g) => `${g.errors ? `<span class="sa-fail">${g.errors} errors</span>` : "0 errors"} · ${g.avgMs} ms on average`;
    const kinds = Object.entries(s.web.byKind).map(([k, n]) => `${esc(k)} ${n}`).join(" · ");
    main.querySelector("#totals").innerHTML =
      card(GROUPS.api[0], GROUPS.api[1], s.api.requests, apiDetail(s.api)) +
      card(GROUPS.web[0], GROUPS.web[1], s.web.requests,
        `${s.web.notFound ? `<span class="sa-fail">${s.web.notFound} not found</span>` : "0 not found"} · ${bytes(s.web.bytes)}${kinds ? ` · ${kinds}` : ""}`) +
      card(GROUPS.silence[0], GROUPS.silence[1], s.silence.requests, apiDetail(s.silence));
    tables.api.update(s.api.endpoints);
    tables.silence.update(s.silence.endpoints);
    tables.web.update(s.web.files);
    const unmatched = Object.entries(s.api.unmatched);
    main.querySelector("#api-unmatched").innerHTML = unmatched.length ? `
      <div class="uk-alert uk-alert-warning sa-small"><strong>Requests to routes without an endpoint (404)</strong>
        <ul class="uk-margin-remove">${unmatched.map(([k, n]) => `<li><span class="sa-route">${esc(k)}</span> ×${n}</li>`).join("")}</ul>
      </div>` : "";
  }

  main.querySelector("#refresh").addEventListener("click", draw);
  main.querySelector("#reset").addEventListener("click", async () => {
    await attempt(() => api("/stats", "DELETE"), "Statistics reset");
    draw();
  });
  await draw();
  // Refreshing every few seconds would reset the filters while typing: only when not filtering
  clearInterval(timer);
  timer = setInterval(() => {
    if (![...main.querySelectorAll("[data-filter]")].some((f) => f.value)) draw();
  }, 5000);
}

export function leave() {
  clearInterval(timer);
}
