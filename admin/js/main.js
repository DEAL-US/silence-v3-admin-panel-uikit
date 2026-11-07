// Admin panel of Silence: a single page with one view per hash (#/endpoints...).
import { api, esc, session, dialogOpen, studentApi } from "./ui.js";
import * as overview from "./pages/overview.js";
import * as database from "./pages/database.js";
import * as users from "./pages/users.js";
import * as endpoints from "./pages/endpoints.js";
import * as tests from "./pages/tests.js";
import * as stats from "./pages/stats.js";

const routes = {
  "": overview,
  database,
  users,
  endpoints,
  tests,
  stats,
};

let current = null;

// Version of the admin API that this panel needs (also in panel.json)
const PANEL_API = 1;
let panelVersion = "";

export const app = {
  info: null,
  status: null,
  async refreshStatus() {
    try {
      this.status = await api("/status");
    } catch {
      return this.status;
    }
    const s = this.status;
    document.querySelector("#project-name").textContent = this.info?.project ?? "";
    document.querySelector("#version").textContent = `Silence v${this.info?.silence ?? "?"} · panel v${panelVersion}`;
    document.querySelector("#link-api").href = s.apiPrefix;
    const dot = document.querySelector("#dot-database");
    dot.className = "sa-dot " + (s.database.error ? "sa-dot--error" : "sa-dot--ok");
    dot.title = s.database.error || s.database.name;
    document.querySelector("#count-endpoints").textContent = s.endpoints.count || "";
    document.querySelector("#count-tests").textContent = s.tests.count || "";
    return s;
  },
};

function showSession() {
  const box = document.querySelector("#acting-as");
  const current = session.get();
  box.hidden = !current;
  if (current) {
    box.innerHTML = `Trying the API as <strong>${esc(current.label)}</strong>
      <button class="uk-button uk-button-default uk-button-small" type="button" id="end-session">End</button>`;
    box.querySelector("#end-session").addEventListener("click", () => session.set(null));
  }
}

let lastRevision = null;
let rendering = false;

/** The project's files changed (panel, editor, git...): show them again, unless the user is editing. */
async function watchRevision() {
  try {
    const s = await api("/status");
    if (lastRevision !== null && s.revision !== lastRevision && !rendering
        && !dialogOpen() && !document.querySelector("#try-form")) {
      lastRevision = s.revision;
      await render();
      return;
    }
    lastRevision = s.revision;
  } catch {
    // Silence stopped: try again later
  }
}

async function render() {
  rendering = true;
  const name = location.hash.replace(/^#\/?/, "").split("/")[0];
  const page = routes[name] ?? overview;
  for (const link of document.querySelectorAll(".sa-nav a")) {
    const target = link.getAttribute("href").replace(/^#\/?/, "");
    link.parentElement.classList.toggle("uk-active", target === name);
    if (target === name) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  }
  document.querySelector("#nav").classList.remove("sa-nav--open");
  if (current?.leave) {
    current.leave();
  }
  current = page;
  const main = document.querySelector("#page");
  main.innerHTML = "";
  await app.refreshStatus();
  lastRevision = app.status?.revision ?? lastRevision;
  try {
    await page.render(main, app);
  } finally {
    rendering = false;
  }
}

async function checkCompatibility() {
  try {
    panelVersion = (await (await fetch("panel.json")).json()).version;
    app.info = await api("/");
    Object.assign(studentApi, app.info.studentApi ?? {});
  } catch {
    return;
  }
  if (app.info.api !== PANEL_API) {
    document.querySelector("#page").insertAdjacentHTML("beforebegin",
      `<div class="uk-alert uk-alert-warning sa-main">This panel needs version ${PANEL_API} of the admin API of Silence,
        and this Silence has version ${app.info.api}. Run <code>silence admin update</code> or update Silence.</div>`);
  }
}

async function main() {
  document.addEventListener("sa-session", showSession);
  window.addEventListener("hashchange", render);
  showSession();
  await checkCompatibility();
  await render();
  setInterval(watchRevision, 3000);
}

document.addEventListener("DOMContentLoaded", main);
