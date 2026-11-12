// Admin panel of Silence: a single page with one view per hash (#/endpoints, #/endpoints/edit/<file>/<name>...).
// Each page exports render(main, app, params), crumbs(params) (the breadcrumb after the
// project, as [{label, href}]) and, for the second-level pages (edit, new, try...), parent(params): where
// the Back button goes. Optionally, leave(): when another page is shown.
import { html } from "./lib/html.js";
import { api, quietApi } from "./lib/api.js";
import { session, studentApi } from "./lib/student-api.js";
import { logEvent, failures, subscribe } from "./lib/log.js";
import * as overview from "./pages/overview.js";
import * as database from "./pages/database.js";
import * as endpoints from "./pages/endpoints.js";
import * as tests from "./pages/tests.js";
import * as logs from "./pages/logs.js";
import * as javascript from "./pages/javascript.js";

// tests: the editor of the custom tests (the tests are seen in Endpoints); stats: the old name of logs
const routes = { "": overview, overview, database, endpoints, tests, js: javascript, logs, stats: logs };

// The panel does not watch the project: it reads its state when a page is shown and after each
// action. A change made outside it (an editor, git...) is seen when the page is shown again.

let current = null;
let panel = { version: "?", api: 1 };  // panel.json

const $ = (selector) => document.querySelector(selector);
const capitalize = (text) => text[0].toUpperCase() + text.slice(1);

export const app = {
  info: null,
  status: null,
  lost: false,
  /** The state of the project (GET /status), for the sidebar and the pages */
  async refreshStatus() {
    let s;
    try {
      s = await quietApi("/status");
    } catch {
      if (this.status && !this.lost) logEvent("Silence", "Cannot reach Silence: is 'silence run' running?", { ok: false });
      this.lost = true;
      return this.status;
    }
    if (this.lost) logEvent("Silence", "Silence is reachable again");
    this.lost = false;
    reportChanges(this.status, s);
    this.status = s;
    drawSidebar(s);
    return s;
  },
};

function drawSidebar(s) {
  $("#project-name").textContent = app.info?.project ?? "";
  $("#version").textContent = `Silence v${app.info?.silence ?? "?"} · panel v${panel.version}`;
  $("#link-api").href = s.apiPrefix;
  const dot = $("#dot-database");
  dot.className = `sa-dot ${s.database.error ? "sa-dot--error" : "sa-dot--ok"}`;
  dot.title = s.database.error || s.database.name;
  $("#count-endpoints").textContent = s.endpoints.count || "";
}

/** The badge of Logs in the menu: the actions of the panel that failed */
function drawLogsBadge() {
  const n = failures();
  const badge = $("#count-failures");
  badge.textContent = n || "";
  badge.title = n ? `${n} failed (see Logs)` : "";
}

/** The changes in the state of the project, to the activity (not the state when the panel opens:
 *  Overview shows it) */
function reportChanges(prev, s) {
  const db = (x) => (x.database.error ? `not connected: ${x.database.error}` : `connected to ${x.database.name}`);
  const users = (x) => (x.auth.linked
    ? `users table ${x.auth.table} linked (login ${x.auth.login ? "on" : "off"}, `
      + `passwords ${x.auth.password_mode})`
    : "users table not linked");
  if (prev) {
    if (db(prev) !== db(s)) {
      logEvent("Database", s.database.error ? `Connection lost: ${s.database.error}` : `Connected to ${s.database.name}`,
        { ok: !s.database.error });
    }
    if (users(prev) !== users(s)) logEvent("Users", capitalize(users(s)));
  }
  for (const [kind, label] of [["config", "silence.json"], ["endpoints", "Endpoints"], ["tests", "Tests"]]) {
    const before = prev?.errors[kind] ?? [];
    const now = s.errors[kind] ?? [];
    const added = now.filter((e) => !before.includes(e));
    if (added.length) logEvent(label, `${added.length} error(s) in the files`, { ok: false, details: added.join("\n") });
    if (before.length && !now.length) logEvent(label, "The errors in the files are fixed");
  }
}

function showSession() {
  const box = $("#acting-as");
  const who = session.get();
  box.hidden = !who;
  if (!who) return;
  box.innerHTML = html`Trying the API as <strong>${who.label}</strong>
    <button class="uk-button uk-button-default uk-button-small" type="button" id="end-session">End</button>`;
  box.querySelector("#end-session").addEventListener("click", () => session.set(null));
}

// The height of the top bar, for the head of the page that is fixed under it (.sa-pagehead)
new ResizeObserver(([entry]) => document.documentElement.style.setProperty("--sa-topbar-h",
  `${entry.target.getBoundingClientRect().height}px`)).observe($("#topbar"));

function drawTopbar(crumbs, parent) {
  // The project first (highlighted), then the breadcrumb; the Back button (second-level pages) at
  // the other end of the bar
  const project = app.info?.project ?? "";
  // The project leads to Overview: it is not repeated (only without a project, e.g., Silence unreachable)
  const all = crumbs.length || project ? crumbs : [{ label: "Overview", href: "#/" }];
  $("#topbar").innerHTML = html`
    <ul class="uk-breadcrumb sa-crumbs">
      ${project ? html`<li class="sa-crumbs__project"><a href="#/" title="${app.info.projectDir}">${capitalize(project)}</a></li>` : ""}
      ${all.map((c, i) => (i === all.length - 1
        ? html`<li><span aria-current="page">${c.label}</span></li>`
        : html`<li><a href="${c.href}">${c.label}</a></li>`))}
    </ul>
    ${parent ? html`<a class="uk-button uk-button-default uk-button-small sa-back" href="${parent}">
      <span uk-icon="icon: arrow-left; ratio: .8"></span> Back</a>` : ""}`;
}

function markNav(name) {
  const active = name === "overview" ? "" : name === "tests" ? "endpoints" : name === "stats" ? "logs" : name;
  for (const a of document.querySelectorAll(".sa-nav a")) {
    const target = a.getAttribute("href").replace(/^#\/?/, "");
    a.parentElement.classList.toggle("uk-active", target === active);
    if (target === active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  $("#nav").classList.remove("sa-nav--open");
}

async function render() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const name = parts[0] ?? "";
  const params = parts.slice(1);
  const page = routes[name] ?? overview;
  markNav(name);
  current?.leave?.();
  current = page;
  const main = $("#page");
  main.innerHTML = "";
  drawTopbar(page.crumbs ? page.crumbs(params) : [], page.parent ? page.parent(params) : null);
  await app.refreshStatus();
  await page.render(main, app, params);
}

/** The versions: of the panel (panel.json) and of Silence, and whether they understand each other */
async function checkCompatibility() {
  try {
    panel = await (await fetch("panel.json")).json();
    app.info = await api("/");
    Object.assign(studentApi, app.info.studentApi ?? {});
  } catch {
    return;
  }
  if (app.info.api !== panel.api) {
    $("#page").insertAdjacentHTML("beforebegin", String(html`<div class="uk-alert uk-alert-warning sa-main">This panel needs
      version ${panel.api} of the admin API of Silence, and this Silence has version ${app.info.api}. Run
      <code>silence admin update</code> or update Silence.</div>`));
  }
}

async function start() {
  document.addEventListener("sa-session", showSession);
  window.addEventListener("hashchange", render);
  showSession();
  subscribe(drawLogsBadge);
  drawLogsBadge();
  await checkCompatibility();
  await render();
}

document.addEventListener("DOMContentLoaded", start);
