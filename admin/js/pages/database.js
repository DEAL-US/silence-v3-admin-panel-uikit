// Database: the connection (tested before saving it) and the users table.
import { api, esc, attempt, toast } from "../ui.js";

export async function render(main, app) {
  const config = (await api("/config")).config;
  const db = config.database;

  main.innerHTML = `
    <h1>Database</h1>
    <section class="sa-section">
      <h2>Connection</h2>
      <p class="uk-text-muted">Silence uses an existing database: create it and load its data first
        (for example, with the scripts of the project's <code>sql/</code> folder).</p>
      <form class="sa-form" id="db-form">
        <div class="sa-field"><label class="uk-form-label" for="db-host">Host</label><input class="uk-input" id="db-host" name="host" value="${esc(db.host)}" required></div>
        <div class="sa-field"><label class="uk-form-label" for="db-port">Port</label><input class="uk-input" id="db-port" name="port" type="number" value="${esc(db.port)}" required></div>
        <div class="sa-field"><label class="uk-form-label" for="db-user">User</label><input class="uk-input" id="db-user" name="user" value="${esc(db.user)}" required></div>
        <div class="sa-field"><label class="uk-form-label" for="db-password">Password</label><input class="uk-input" id="db-password" name="password" type="password" value="${esc(db.password)}"></div>
        <div class="sa-field"><label class="uk-form-label" for="db-name">Database</label>
          <select class="uk-select" id="db-name" name="name"><option value="${esc(db.name)}">${esc(db.name || "(choose one)")}</option></select></div>
        <div class="sa-toolbar">
          <button class="uk-button uk-button-default" type="button" id="db-list">Load the databases</button>
          <button class="uk-button uk-button-primary" type="submit">Test and save</button>
        </div>
      </form>
      <p id="db-result"></p>
    </section>

    <section class="sa-section" id="auth-section">
      <h2>Users table</h2>
      <p class="uk-text-muted">The table with the users of your application: it enables <code>POST ${esc(app.status.apiPrefix)}/login</code>
        and <code>/register</code>, sessions, roles (a column of the table) and owners.</p>
      <div id="auth-body"></div>
    </section>`;

  const form = main.querySelector("#db-form");
  const values = () => Object.fromEntries(new FormData(form));

  main.querySelector("#db-list").addEventListener("click", async () => {
    const res = await attempt(() => api("/database/list", "POST", values()));
    if (!res) return;
    if (!res.ok) {
      toast(res.error, "error");
      return;
    }
    const select = main.querySelector("#db-name");
    const selected = select.value;
    select.innerHTML = `<option value="">(choose one)</option>` + res.databases.map((d) =>
      `<option ${d === selected ? "selected" : ""}>${esc(d)}</option>`).join("");
    toast(`${res.databases.length} databases`, "success");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const v = values();
    v.port = Number(v.port);
    const res = await attempt(() => api("/config/database", "PATCH", v), "Connected and saved in silence.json");
    if (res) {
      await app.refreshStatus();
      renderAuth(main, app);
    }
  });

  renderAuth(main, app);
}

async function renderAuth(main, app) {
  const body = main.querySelector("#auth-body");
  if (app.status.database.error) {
    body.innerHTML = `<div class="uk-alert uk-alert-warning">Connect to the database first.</div>`;
    return;
  }
  const auth = (await api("/config")).config.auth;
  const schema = await api("/schema");
  const tables = schema.relations.filter((r) => !r.view);

  const options = (cols, selected, empty) => `<option value="">${empty}</option>` +
    cols.map((c) => `<option ${c === selected ? "selected" : ""}>${esc(c)}</option>`).join("");

  body.innerHTML = `
    <form class="sa-form" id="auth-form">
      <div class="sa-field"><label class="uk-form-label" for="auth-table">Table</label>
        <select class="uk-select" id="auth-table" name="table">${options(tables.map((t) => t.name), auth.table, "(not linked)")}</select></div>
      <div class="sa-field"><label class="uk-form-label" for="auth-identifier">Identifier</label><select class="uk-select" id="auth-identifier" name="identifier"></select></div>
      <div class="sa-field"><label class="uk-form-label" for="auth-password">Password</label><select class="uk-select" id="auth-password" name="password"></select></div>
      <div class="sa-field"><label class="uk-form-label" for="auth-role">Role (optional)</label><select class="uk-select" id="auth-role" name="role"></select></div>
      <div class="sa-field"><label class="uk-form-label" for="auth-active">Active (optional)</label><select class="uk-select" id="auth-active" name="active"></select></div>
      <div class="sa-field"><label class="uk-form-label" for="auth-mode">Passwords</label>
        <select class="uk-select" id="auth-mode" name="password_mode">
          <option value="argon2" ${auth.password_mode === "argon2" ? "selected" : ""}>Encrypted (argon2)</option>
          <option value="plain" ${auth.password_mode === "plain" ? "selected" : ""}>Plain text</option>
        </select></div>
      <div class="sa-field"><label class="uk-form-label" for="auth-default-role">Role of new users (register)</label>
        <input class="uk-input" id="auth-default-role" name="default_role" value="${esc(auth.default_role)}"></div>
      <div class="sa-field"><label><input class="uk-checkbox" type="checkbox" name="login" ${auth.login ? "checked" : ""}> Login</label>
        <label><input class="uk-checkbox" type="checkbox" name="register" ${auth.register ? "checked" : ""}> Register</label></div>
      <div class="sa-toolbar"><button class="uk-button uk-button-primary" type="submit">Save</button></div>
    </form>`;

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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const v = Object.fromEntries(new FormData(form));
    v.login = form.querySelector("[name=login]").checked;
    v.register = form.querySelector("[name=register]").checked;
    if (v.table && (!v.identifier || !v.password)) {
      toast("Choose the identifier and password columns", "error");
      return;
    }
    if (!v.table) {
      v.identifier = v.password = v.role = v.active = "";
    }
    if (await attempt(() => api("/config/auth", "PATCH", v), "Saved in silence.json")) {
      await app.refreshStatus();
    }
  });
}
