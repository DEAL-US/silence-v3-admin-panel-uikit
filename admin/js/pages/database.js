// Database, in tabs: #/database/connection (tested before saving it; testing it also lists the
// databases), #/database/tables (the tables and views, with their rows), #/database/auth (the
// users table) and #/database/users (the users: passwords and "act as"; .../users/password/<id>
// to change one). The tabs that need the database are disabled while the connection fails or is
// being changed; Users, until the users table is linked.
import { html, pageHead, tabs, options, muted } from "../lib/html.js";
import { api, quietApi, loadEndpoints } from "../lib/api.js";
import { readConfig, saveConfig, listFiles } from "../lib/files.js";
import { attempt, toast, reloadDatabase } from "../lib/ui.js";
import { formValues } from "../lib/forms.js";
import { dataTable } from "../components/table.js";
import { orderedList } from "../components/ordered-list.js";
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
  nav.innerHTML = tabs(Object.entries(TABS).map(([key, label]) =>
    ({ key, label, href: `#/database/${key}`, disabled: blocked(key, app, changing) })), tab);
}

export async function render(main, app, params) {
  const [requested, view, id] = params;
  const why = blocked(requested, app, false);
  const tab = TABS[requested] && !why ? requested : "connection";
  main.innerHTML = html`
    ${pageHead("Database", html`<div id="db-tabs"></div>`)}
    ${why && requested && requested !== "connection" ? html`<div class="uk-alert uk-alert-warning">${why}.</div>` : ""}
    <div id="tab"></div>`;
  const nav = main.querySelector("#db-tabs");
  const redrawTabs = (changing) => drawTabs(nav, tab, app, changing);
  redrawTabs();
  const body = main.querySelector("#tab");
  if (tab === "connection") return connection(body, app, redrawTabs);
  if (tab === "tables") return tables(body, app);
  if (tab === "users") return view === "password" ? passwordPage(body, id) : usersTab(body, app);
  return usersTable(body, app, redrawTabs);
}

///////////////////////////////////////////////////////////////////////////////
// Connection
///////////////////////////////////////////////////////////////////////////////

async function connection(body, app, redrawTabs) {
  const res = await attempt(() => readConfig());
  if (!res) return;
  const db = res.config.database;
  const scripts = db.scripts ?? [];
  const input = (name, label, value, type = "text", required = true) => html`<div class="sa-field">
    <label class="uk-form-label" for="db-${name}">${label}</label>
    <input class="uk-input" id="db-${name}" name="${name}" type="${type}" value="${value}" ${required ? "required" : ""}></div>`;
  const empty = !app.status.database.error && app.status.database.tables === 0;
  body.innerHTML = html`
    ${empty ? html`<div class="uk-alert uk-alert-warning">The database <code>${app.status.database.name}</code> is empty:
      choose the scripts of <code>sql/</code> that create its tables and load its data, below, and <em>Reload the
      database</em>.</div>` : ""}
    <p class="uk-text-muted">Silence uses an existing database: create it (it may be empty) and connect to it here. Its
      tables and data come from the scripts of <code>sql/</code>, below.</p>
    <form class="sa-form" id="db-form">
      ${input("host", "Host", db.host)}
      ${input("port", "Port", db.port, "number")}
      ${input("user", "User", db.user)}
      ${input("password", "Password", db.password, "password", false)}
      <div class="sa-field"><label class="uk-form-label" for="db-name">Database</label>
        <select class="uk-select" id="db-name" name="name">${options(db.name ? [db.name] : [], db.name,
          db.name ? undefined : "(test the connection to list them)")}</select></div>
      <div class="sa-toolbar"><button class="uk-button uk-button-primary" type="submit">Test and save</button></div>
    </form>
    <div id="db-result" role="status"></div>
    <h3 id="load">Load the database</h3>
    <p class="uk-text-muted sa-small">The scripts of the project's <code>sql/</code> folder that create the tables and load
      the data, in the order to run them. <em>Reload the database</em> drops it and creates it again with them, as
      <code>silence createdb</code>: also to run the tests again from the original data.</p>
    <ol id="scripts-list"></ol>
    <div class="sa-toolbar">
      <select class="uk-select uk-form-width-medium" id="scripts-add" aria-label="Add a script"></select>
      <button class="uk-button uk-button-default" type="button" id="scripts-save">Save the scripts</button>
      <button class="uk-button ${empty ? "uk-button-primary" : "uk-button-default"}" type="button" id="db-reload">Reload the database</button>
    </div>`;

  const form = body.querySelector("#db-form");
  const select = body.querySelector("#db-name");
  const result = body.querySelector("#db-result");
  const fill = (databases) => {
    select.innerHTML = options(databases, select.value, "(choose one)");
  };
  const show = (ok, text) => {
    result.innerHTML = html`<div class="uk-alert uk-alert-${ok ? "success" : "warning"}">${text}</div>`;
  };

  // The list of databases, without saving anything (and without going to the activity)
  if (db.host && db.user) {
    const found = await quietApi("/database/test", "POST", formValues(form)).catch(() => null);
    if (found?.databases.length) fill(found.databases);
  }
  // The scripts: chosen among the files of sql/, in a list to move up, down and remove
  const available = ((await listFiles("sql").catch(() => [])) ?? []).map((f) => f.path.replace(/^sql\//, ""));
  let saved = [...scripts];
  const list = orderedList(body.querySelector("#scripts-list"), {
    items: scripts,
    labels: { up: "Run it before", down: "Run it after" },
    empty: available.length ? "None yet: add the scripts that create the tables and load the data."
      : html`There are no scripts in <code>sql/</code>: put there the ones that create the tables and load the data.`,
    render: (s) => html`<code class="sa-unit ${available.includes(s) ? "" : "sa-unit--missing"}">${s}</code>
      ${available.includes(s) ? "" : html`<span class="uk-text-danger sa-small">(it is not in sql/)</span>`}`,
    onChange: () => fillAdd(),
  });
  const add = body.querySelector("#scripts-add");
  const fillAdd = () => {
    const rest = available.filter((s) => !list.items().includes(s));
    add.innerHTML = options(rest, "", rest.length ? "Add a script of sql/…" : "(all the scripts of sql/ are added)");
    add.disabled = !rest.length;
  };
  fillAdd();
  add.addEventListener("change", () => {
    if (add.value) list.add(add.value);
  });
  const saveScripts = async () => {
    const items = list.items();
    if (JSON.stringify(items) === JSON.stringify(saved)) return true;
    if (!await attempt(() => saveConfig("database", { scripts: items }), "Scripts saved in silence.json")) return false;
    saved = items;
    return true;
  };
  body.querySelector("#scripts-save").addEventListener("click", saveScripts);
  // Reloading saves the scripts first (Silence runs the ones of silence.json)
  body.querySelector("#db-reload").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    if (!list.items().length) return toast("Add the scripts of sql/ that create the database first", "error");
    if (button.dataset.armed && !await saveScripts()) return;
    if (await reloadDatabase(button, list.items())) {
      await app.refreshStatus();
      body.querySelector(".uk-alert-warning")?.remove();
    }
  });
  form.addEventListener("input", () => {
    redrawTabs(true);
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formValues(form);
    const test = await attempt(() => api("/database/test", "POST", values));
    if (!test) return;
    if (!test.databases.length) return show(false, test.error);
    fill(test.databases);
    if (!values.name) return show(false, `Connected: now choose one of the ${test.databases.length} databases and save.`);
    if (!test.ok) return show(false, test.error);
    if (await attempt(() => saveConfig("database", values), "Connected and saved in silence.json")) {
      show(true, html`Connected to <code>${values.name}</code> and saved in <code>silence.json</code>.`);
      await app.refreshStatus();
      redrawTabs(false);
    }
  });
}

///////////////////////////////////////////////////////////////////////////////
// Tables and views
///////////////////////////////////////////////////////////////////////////////

async function tables(body, app) {
  const [schema, eps] = await Promise.all([attempt(() => api("/schema")), attempt(() => loadEndpoints({ quiet: true }))]);
  if (!schema || !eps) return;
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  const usersTable = app.status.auth.linked ? app.status.auth.table : null;
  const rows = schema.relations.map((r) => ({
    ...r,
    kind: r.view ? "view" : "table",
    columnCount: r.columns.length,
    references: [...new Set(r.fks.map((f) => f.refTable))],
    referencedBy: schema.relations.filter((x) => x.fks.some((f) => same(f.refTable, r.name))).map((x) => x.name),
    endpoints: eps.endpoints.filter((e) => same(e.table, r.name) && !e.disabled).length,
  }));
  const tableCount = rows.filter((r) => !r.view).length;
  const names = (list) => (list.length ? list.map((n, i) => html`${i ? " " : ""}<code>${n}</code>`) : muted());

  body.innerHTML = html`
    <p class="uk-text-muted"><code>${schema.database}</code>: ${tableCount} tables and ${rows.length - tableCount} views.</p>
    <div id="grid"></div>`;
  dataTable(body.querySelector("#grid"), {
    rows, sort: { key: "name", dir: "asc" }, empty: "The database has no tables.",
    columns: [
      { key: "name", label: "Name", render: (r) => html`<strong>${r.name}</strong>
          ${usersTable && same(r.name, usersTable) ? html`<span class="uk-label sa-label-users" title="The users table">users</span>` : ""}` },
      { key: "kind", label: "Kind", filter: "select" },
      { key: "rows", label: "Rows", filter: false,
        render: (r) => (r.rows === null ? html`<span class="uk-text-danger" title="It cannot be counted">?</span>` : html`${r.rows}`) },
      { key: "columnCount", label: "Columns", filter: false },
      { key: "pk", label: "Primary key", value: (r) => r.pk.join(", "), render: (r) => names(r.pk) },
      { key: "references", label: "References", value: (r) => r.references.join(" "), render: (r) => names(r.references) },
      { key: "referencedBy", label: "Referenced by", value: (r) => r.referencedBy.join(" "), render: (r) => names(r.referencedBy) },
      { key: "endpoints", label: "Endpoints", filter: false,
        render: (r) => (r.endpoints ? html`<a href="#/endpoints">${r.endpoints}</a>` : muted("0")) },
    ],
  });
}

///////////////////////////////////////////////////////////////////////////////
// Users table
///////////////////////////////////////////////////////////////////////////////

async function usersTable(body, app, redrawTabs) {
  const [config, schema] = await Promise.all([attempt(() => readConfig()), attempt(() => api("/schema"))]);
  if (!config || !schema) return;
  const auth = config.config.auth;
  const relations = schema.relations.filter((r) => !r.view);
  const select = (name, label) => html`<div class="sa-field"><label class="uk-form-label" for="auth-${name}">${label}</label>
    <select class="uk-select" id="auth-${name}" name="${name}"></select></div>`;

  body.innerHTML = html`
    <form id="auth-form">
      <p class="uk-text-muted">The table with the users of your application: it enables the login and the logout,
        sessions, roles (a column of the table) and owners. The identifier (e.g., the email) may be in a table that it
        references, as <code>people.email</code> for <code>credentials(person_id → people, password, role)</code>. The
        users table is a table like the others: its endpoints create, change and delete users (in argon2 mode its reads do
        not send the passwords and its writes encrypt them; in plain mode they are seen as they are); give its writes
        authentication and roles. Login and
        passwords are in <a href="#/overview/login">Overview</a>.</p>
      <div class="sa-form">
        <div class="sa-field"><label class="uk-form-label" for="auth-table">Table</label>
          <select class="uk-select" id="auth-table" name="table">${options(relations.map((t) => t.name), auth.table, "(not linked)")}</select></div>
        ${select("identifier", "Identifier")}
        ${select("password", "Password")}
        ${select("role", "Role (optional)")}
        ${select("active", "Active (optional)")}
      </div>
      <div class="sa-toolbar"><button class="uk-button uk-button-primary" type="submit">Save</button></div>
    </form>`;

  const form = body.querySelector("#auth-form");
  const tableSelect = form.querySelector("#auth-table");
  // The columns of the chosen table, with a guess of each one (or what silence.json says)
  const GUESSES = { identifier: ["email", "username", "login"], password: ["password", "pass", "pwd"],
    role: ["role", "rol", "position", "type"], active: ["active", "isactive", "is_active", "enabled"] };
  const fillColumns = () => {
    const table = relations.find((t) => t.name === tableSelect.value);
    const cols = table ? table.columns.map((c) => c.name) : [];
    // The identifier may also be a column of a table that this one references (table.column)
    const referenced = (table?.fks ?? []).flatMap((fk) => (relations.find((r) => r.name === fk.refTable)?.columns ?? [])
      .map((c) => `${fk.refTable}.${c.name}`));
    for (const [field, names] of Object.entries(GUESSES)) {
      const choices = field === "identifier" ? [...cols, ...referenced] : cols;
      const guess = choices.find((c) => names.includes(c.split(".").pop().toLowerCase()));
      const chosen = table && table.name === auth.table && auth[field] ? auth[field] : guess;
      form.querySelector(`#auth-${field}`).innerHTML = options(choices, chosen, field === "role" || field === "active" ? "(none)" : "—");
    }
  };
  tableSelect.addEventListener("change", fillColumns);
  fillColumns();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const v = formValues(form);
    if (v.table && (!v.identifier || !v.password)) {
      toast("Choose the identifier and password columns", "error");
      return;
    }
    if (!v.table) Object.assign(v, { identifier: "", password: "", role: "", active: "" });
    if (await attempt(() => saveConfig("auth", v), "Saved in silence.json")) {
      await app.refreshStatus();
      redrawTabs();  // The Users tab is enabled (or disabled) as the table is linked (or not)
    }
  });
}
