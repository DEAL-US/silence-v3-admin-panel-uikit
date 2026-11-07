// Database, in tabs: #/database/connection (tested before saving it; testing it also lists
// the databases), #/database/tables (the tables and views, with their rows), #/database/auth
// (the users table, login and register) and #/database/users (the users: passwords and "act
// as"; #/database/users/password/<id> to change one). The tabs that need the database are
// disabled while the connection fails or is being changed; Users, until the users table is linked.
import { api, esc, attempt, toast, editing } from "../ui.js";
import { dataTable } from "../components/table.js";
import { usersTab, passwordPage } from "./users.js";

const TABS = { connection: "Connection", tables: "Tables and views", auth: "Users table", users: "Users" };

export function crumbs(params) {
  const [tab, view, id] = params;
  const base = [{ label: "Database", href: "#/database" }];
  if (tab === "users" && view === "password") {
    return [...base, { label: "Users", href: "#/database/users" }, { label: `Password of user ${id}` }];
  }
  return [...base, { label: TABS[tab] ?? TABS.connection }];
}

export function parent(params) {
  return params[0] === "users" && params[1] === "password" ? "#/database/users" : null;
}

/** Why a tab cannot be opened now (null: it can) */
function blocked(tab, app, changing) {
  if (tab === "connection") return null;
  if (app.status.database.error) return "Connect to the database first";
  if (changing) return "Save the connection first";
  if (tab === "users" && !app.status.auth.linked) return "Link the users table first";
  return null;
}

function drawTabs(nav, tab, app, changing = false) {
  nav.innerHTML = Object.entries(TABS).map(([key, label]) => {
    const why = blocked(key, app, changing);
    return why
      ? `<li class="uk-disabled" title="${esc(why)}"><a aria-disabled="true">${label}</a></li>`
      : `<li class="${key === tab ? "uk-active" : ""}"><a href="#/database/${key}">${label}</a></li>`;
  }).join("");
}

export async function render(main, app, params) {
  const [requested, view, id] = params;
  let tab = TABS[requested] ? requested : "connection";
  const why = blocked(tab, app, false);
  if (why) tab = "connection";
  main.innerHTML = `
    <h1>Database</h1>
    <ul class="uk-tab sa-tabs" id="db-tabs"></ul>
    ${why && requested && requested !== "connection" ? `<div class="uk-alert uk-alert-warning">${esc(why)}.</div>` : ""}
    <div id="tab"></div>`;
  const nav = main.querySelector("#db-tabs");
  drawTabs(nav, tab, app);
  const body = main.querySelector("#tab");
  if (tab === "connection") return connection(body, app, (changing) => drawTabs(nav, tab, app, changing));
  if (tab === "tables") return tables(body, app);
  if (tab === "users") return view === "password" ? passwordPage(body, id) : usersTab(body, app);
  return users(body, app, () => drawTabs(nav, tab, app));
}

///////////////////////////////////////////////////////////////////////////////
// Connection
///////////////////////////////////////////////////////////////////////////////

async function connection(body, app, onChange) {
  const db = (await api("/config")).config.database;
  body.innerHTML = `
    <p class="uk-text-muted">Silence uses an existing database: create it and load its data first
      (for example, with the scripts of the project's <code>sql/</code> folder).</p>
    <form class="sa-form" id="db-form">
      <div class="sa-field"><label class="uk-form-label" for="db-host">Host</label><input class="uk-input" id="db-host" name="host" value="${esc(db.host)}" required></div>
      <div class="sa-field"><label class="uk-form-label" for="db-port">Port</label><input class="uk-input" id="db-port" name="port" type="number" value="${esc(db.port)}" required></div>
      <div class="sa-field"><label class="uk-form-label" for="db-user">User</label><input class="uk-input" id="db-user" name="user" value="${esc(db.user)}" required></div>
      <div class="sa-field"><label class="uk-form-label" for="db-password">Password</label><input class="uk-input" id="db-password" name="password" type="password" value="${esc(db.password)}"></div>
      <div class="sa-field"><label class="uk-form-label" for="db-name">Database</label>
        <select class="uk-select" id="db-name" name="name"><option value="${esc(db.name)}">${esc(db.name || "(test the connection to list them)")}</option></select></div>
      <div class="sa-toolbar">
        <button class="uk-button uk-button-primary" type="submit">Test and save</button>
      </div>
    </form>
    <div id="db-result"></div>`;

  const page = body.closest("#page");
  const form = body.querySelector("#db-form");
  const select = body.querySelector("#db-name");
  const result = body.querySelector("#db-result");
  const values = () => {
    const v = Object.fromEntries(new FormData(form));
    v.port = Number(v.port);
    return v;
  };
  const fill = (databases) => {
    const selected = select.value;
    select.innerHTML = `<option value="">(choose one)</option>` + databases.map((d) =>
      `<option ${d === selected ? "selected" : ""}>${esc(d)}</option>`).join("");
  };
  const show = (ok, text) => {
    result.innerHTML = `<div class="uk-alert uk-alert-${ok ? "success" : "warning"}">${text}</div>`;
  };

  // The list of databases, without saving anything (and without going to the console)
  if (db.host && db.user) {
    try {
      const res = await api("/database/test", "POST", values(), undefined, { quiet: true });
      if (res.databases.length) fill(res.databases);
    } catch {
      // Silence is not reachable: the console says so
    }
  }
  form.addEventListener("input", () => {
    editing(page, true);
    onChange(true);
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const res = await attempt(() => api("/database/test", "POST", values()));
    if (!res) return;
    if (res.databases.length) fill(res.databases);
    if (!res.databases.length) {
      show(false, esc(res.error));
      return;
    }
    if (!values().name) {
      show(false, `Connected: now choose one of the ${res.databases.length} databases and save.`);
      return;
    }
    if (!res.ok) {
      show(false, esc(res.error));
      return;
    }
    if (await attempt(() => api("/config/database", "PATCH", values()), "Connected and saved in silence.json")) {
      show(true, `Connected to <code>${esc(values().name)}</code> and saved in <code>silence.json</code>.`);
      editing(page, false);
      await app.refreshStatus();
      onChange(false);
    }
  });
}

///////////////////////////////////////////////////////////////////////////////
// Tables and views
///////////////////////////////////////////////////////////////////////////////

async function tables(body, app) {
  const [schema, eps] = await Promise.all([attempt(() => api("/schema")), attempt(() => api("/endpoints"))]);
  if (!schema || !eps) return;
  const usersTable = app.status.auth.linked ? app.status.auth.table.toLowerCase() : null;
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  const rows = schema.relations.map((r) => ({
    ...r,
    kind: r.view ? "view" : "table",
    columnCount: r.columns.length,
    references: [...new Set(r.fks.map((f) => f.refTable))],
    referencedBy: schema.relations.filter((x) => x.fks.some((f) => same(f.refTable, r.name))).map((x) => x.name),
    endpoints: eps.endpoints.filter((e) => same(e.table, r.name)).length,
  }));
  const tableCount = rows.filter((r) => !r.view).length;

  body.innerHTML = `
    <p class="uk-text-muted"><code>${esc(schema.database)}</code>: ${tableCount} tables and ${rows.length - tableCount} views.</p>
    <div id="grid"></div>`;
  const list = (names) => (names.length ? names.map((n) => `<code>${esc(n)}</code>`).join(" ") : `<span class="uk-text-muted">—</span>`);
  dataTable(body.querySelector("#grid"), {
    rows, sort: { key: "name", dir: "asc" }, empty: "The database has no tables.",
    columns: [
      { key: "name", label: "Name", render: (r) => `<strong>${esc(r.name)}</strong>` +
          (r.name.toLowerCase() === usersTable ? ` <span class="uk-label sa-label-users" title="The users table">users</span>` : "") },
      { key: "kind", label: "Kind", filter: "select" },
      { key: "rows", label: "Rows", filter: false,
        render: (r) => (r.rows === null ? `<span class="uk-text-danger" title="It cannot be counted">?</span>` : r.rows) },
      { key: "columnCount", label: "Columns", filter: false },
      { key: "pk", label: "Primary key", value: (r) => r.pk.join(", "), render: (r) => list(r.pk) },
      { key: "references", label: "References", value: (r) => r.references.join(" "), render: (r) => list(r.references) },
      { key: "referencedBy", label: "Referenced by", value: (r) => r.referencedBy.join(" "), render: (r) => list(r.referencedBy) },
      { key: "endpoints", label: "Endpoints", filter: false,
        render: (r) => (r.endpoints ? `<a href="#/endpoints">${r.endpoints}</a>` : `<span class="uk-text-muted">0</span>`) },
    ],
  });
}

///////////////////////////////////////////////////////////////////////////////
// Users table: login and register
///////////////////////////////////////////////////////////////////////////////

async function users(body, app, onLinked) {
  const [config, schema] = await Promise.all([attempt(() => api("/config")), attempt(() => api("/schema"))]);
  if (!config || !schema) return;
  const auth = config.config.auth;
  const tables = schema.relations.filter((r) => !r.view);

  const options = (cols, selected, empty) => `<option value="">${empty}</option>` +
    cols.map((c) => `<option ${c === selected ? "selected" : ""}>${esc(c)}</option>`).join("");

  body.innerHTML = `
    <form id="auth-form">
      <fieldset class="sa-block">
        <legend>Table and columns</legend>
        <p class="uk-text-muted sa-small">The table with the users of your application: it enables the login and the register,
          sessions, roles (a column of the table) and owners.</p>
        <div class="sa-form">
          <div class="sa-field"><label class="uk-form-label" for="auth-table">Table</label>
            <select class="uk-select" id="auth-table" name="table">${options(tables.map((t) => t.name), auth.table, "(not linked)")}</select></div>
          <div class="sa-field"><label class="uk-form-label" for="auth-identifier">Identifier</label><select class="uk-select" id="auth-identifier" name="identifier"></select></div>
          <div class="sa-field"><label class="uk-form-label" for="auth-password">Password</label><select class="uk-select" id="auth-password" name="password"></select></div>
          <div class="sa-field"><label class="uk-form-label" for="auth-role">Role (optional)</label><select class="uk-select" id="auth-role" name="role"></select></div>
          <div class="sa-field"><label class="uk-form-label" for="auth-active">Active (optional)</label><select class="uk-select" id="auth-active" name="active"></select></div>
        </div>
      </fieldset>
      <div class="sa-toolbar"><button class="uk-button uk-button-primary" type="submit">Save</button></div>
    </form>`;

  const page = body.closest("#page");
  const form = body.querySelector("#auth-form");
  const tableSelect = form.querySelector("#auth-table");
  const fillColumns = () => {
    const table = tables.find((t) => t.name === tableSelect.value);
    const cols = table ? table.columns.map((c) => c.name) : [];
    const guess = (names) => cols.find((c) => names.includes(c.toLowerCase())) ?? "";
    const pick = (field, names) => (table && table.name === auth.table && auth[field]) ? auth[field] : guess(names);
    form.querySelector("#auth-identifier").innerHTML = options(cols, pick("identifier", ["email", "username", "login"]), "—");
    form.querySelector("#auth-password").innerHTML = options(cols, pick("password", ["password", "pass", "pwd"]), "—");
    form.querySelector("#auth-role").innerHTML = options(cols, pick("role", ["role", "rol", "position", "type"]), "(none)");
    form.querySelector("#auth-active").innerHTML = options(cols, pick("active", ["active", "isactive", "is_active", "enabled"]), "(none)");
  };
  tableSelect.addEventListener("change", fillColumns);
  fillColumns();

  form.addEventListener("input", () => editing(page, true));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const v = Object.fromEntries(new FormData(form));
    if (v.table && (!v.identifier || !v.password)) {
      toast("Choose the identifier and password columns", "error");
      return;
    }
    if (!v.table) {
      v.identifier = v.password = v.role = v.active = "";
    }
    if (await attempt(() => api("/config/auth", "PATCH", v), "Saved in silence.json")) {
      editing(page, false);
      await app.refreshStatus();
      onLinked();  // The Users tab is enabled (or disabled) as the table is linked (or not)
    }
  });
}
