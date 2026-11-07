// Users: the rows of the linked users table, their passwords and "act as". A tab of Database:
// #/database/users and #/database/users/password/<id> (or .../password/all).
import { api, esc, attempt, session, toast, editing, link, iconButton } from "../ui.js";
import { dataTable } from "../components/table.js";

const STATUS = {
  argon2: `<span class="uk-label uk-label-success">argon2</span>`,
  plain: `<span class="uk-label sa-label-auto">plain text</span>`,
  unsupported: `<span class="uk-label uk-label-danger">unsupported hash</span>`,
};

export async function usersTab(main, app) {
  const res = await attempt(() => api("/users"));
  if (!res) return;
  const auth = app.status.auth;
  const mode = res.passwordMode;
  const wrong = res.users.filter((u) => u.password === "unsupported" || (mode === "argon2" && u.password === "plain"));

  main.innerHTML = `
    ${wrong.length ? `<div class="uk-alert uk-alert-warning">${wrong.length} users cannot log in: their stored password is
      ${mode === "argon2" ? "not an argon2 hash" : "a hash that Silence does not support"}. Set their password again.</div>` : ""}
    <div class="sa-toolbar">
      <span class="uk-text-muted">Table <code>${esc(auth.table)}</code>; passwords stored ${mode === "argon2" ? "encrypted (argon2)" : "as plain text"}.</span>
      <span class="sa-toolbar__spacer"></span>
      <a class="uk-button uk-button-default" href="#/database/users/password/all">Same password for everybody</a>
    </div>
    <div id="grid"></div>
    <p class="uk-text-muted sa-small">«Act as» opens a session for that user without its password: the endpoints that you
      try in this panel are sent with its token.</p>`;

  const columns = [
    { key: "actions", label: "", filter: false, sortable: false, className: "sa-actions", render: (u) =>
      iconButton("lock", "Set password", { href: link("database", "users", "password", u.id) }) +
      iconButton("user", "Act as this user (try the endpoints with its session)", { action: "act" }) },
    { key: "id", label: res.pk, value: (u) => u.id },
    { key: "identifier", label: auth.identifier },
  ];
  if (auth.role) columns.push({ key: "role", label: auth.role, filter: "select", value: (u) => u.role ?? "" });
  if (auth.active) columns.push({ key: "active", label: auth.active, filter: "select", value: (u) => (u.active ? "yes" : "no") });
  columns.push(
    { key: "password", label: "Password", filter: "select", render: (u) => STATUS[u.password] },
  );

  dataTable(main.querySelector("#grid"), {
    columns, rows: res.users, sort: { key: "id", dir: "asc" }, empty: "The users table is empty.",
    onAction: async (action, u) => {
      if (action !== "act") return;
      const s = await attempt(() => api(`/users/${encodeURIComponent(u.id)}/session`, "POST"));
      if (s) {
        session.set({ token: s.sessionToken, label: u.identifier });
        toast(`Acting as ${u.identifier}`, "success");
      }
    },
  });
}

export async function passwordPage(main, id) {
  const all = id === "all";
  main.innerHTML = `
    <h1>${all ? "Same password for everybody" : `Password of user ${esc(id)}`}</h1>
    <form id="password-form" class="sa-form">
      <div class="sa-field"><label class="uk-form-label" for="new-password">New password</label>
        <input class="uk-input" id="new-password" name="password" required autocomplete="new-password"></div>
      <div class="sa-toolbar">
        <button class="uk-button uk-button-primary" type="submit">Save</button>
        <a class="uk-button uk-button-default" href="#/database/users">Cancel</a>
      </div>
    </form>`;
  const form = main.querySelector("#password-form");
  form.addEventListener("input", () => editing(main, true));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = form.querySelector("#new-password").value;
    const path = all ? "/users/password" : `/users/${encodeURIComponent(id)}/password`;
    if (await attempt(() => api(path, "PUT", { password }), all ? "Passwords saved" : "Password saved")) {
      editing(main, false);
      location.hash = "#/database/users";
    }
  });
}
