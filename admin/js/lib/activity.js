// What each action on Silence (a call to its admin API that changes something) means, for the
// console: its text and where the panel shows what it changed. Without DOM: it can be tested.

const onOff = (value) => (value ? "on" : "off");

/** The text of an action: [source, message]. body: what was sent; data: what Silence answered */
export function describe(method, path, body = {}, data = {}) {
  const [res, a, b, c] = path.split("?")[0].split("/").filter(Boolean).map(decodeURIComponent);
  body ??= {};
  data ??= {};
  const target = a && b ? `${a}/${b}` : a;

  if (res === "database" && a === "test") {
    const where = `${body.user ?? ""}@${body.host ?? ""}:${body.port ?? ""}${body.name ? `/${body.name}` : ""}`;
    const result = data.ok ? ", connected" : data.error ? `: ${data.error}` : "";
    const found = data.databases ? ` (${data.databases.length} databases)` : "";
    return ["Database", `Connection tested: ${where}${result}${found}`];
  }
  if (res === "database" && a === "reload") {
    return ["Database", data.scripts
      ? `Created again with ${data.scripts.map((x) => `${x.file} (${x.statements})`).join(", ")}`
      : "Creating it again failed"];
  }
  if (res === "config" && a === "database") {
    return Object.keys(body).join() === "scripts"
      ? ["Database", `Scripts saved in silence.json: ${body.scripts.join(", ") || "none"}`]
      : ["Database", `Connection saved in silence.json: ${body.name ?? ""}`];
  }
  if (res === "config" && a === "auth") {
    if ("table" in body) {
      return ["Users", body.table
        ? `Users table linked: ${body.table} (identifier ${body.identifier}, password ${body.password}`
          + `${body.role ? `, role ${body.role}` : ""})`
        : "Users table unlinked"];
    }
    const said = [];
    if ("login" in body) said.push(`login ${onOff(body.login)}`);
    if ("register" in body) said.push(`register ${onOff(body.register)}`);
    if ("password_mode" in body) {
      said.push(`passwords ${body.password_mode === "argon2" ? "encrypted (argon2)" : "as plain text"}`);
    }
    if ("default_role" in body) said.push(`role of the new users ${body.default_role ? `'${body.default_role}'` : "none"}`);
    if ("token_max_age" in body) said.push(`sessions of ${body.token_max_age} s`);
    return ["Users", `Saved in silence.json: ${said.join(", ")}`];
  }
  if (res === "config") return ["Settings", `${a} saved in silence.json`];
  if (res === "users" && b === "password") return ["Users", `Password of user ${a} changed`];
  if (res === "users" && b === "session") {
    const who = data.user ? Object.values(data.user).filter((v) => v !== null && v !== "" && typeof v !== "object") : [];
    return ["Users", `Session opened as user ${a}${who.length ? ` (${who.slice(0, 3).join(", ")})` : ""}`];
  }
  if (res === "endpoints" || res === "tests") {
    const kind = res === "endpoints" ? "Endpoints" : "Tests";
    if (a === "generate") {
      const tables = data.tables ?? [];
      return [kind, res === "endpoints"
        ? `Generated: ${tables.reduce((n, t) => n + t.generated.length, 0)} endpoints of ${tables.length} tables and views`
        : `Generated: ${tables.reduce((n, t) => n + t.tests, 0)} tests`];
    }
    if (c === "customize") return [kind, `${target} moved to custom${data.file ? ` (${data.file}/${data.name})` : ""}`];
    if (method === "PUT") return [kind, `${target} saved`];
    if (method === "DELETE") return [kind, `${target} deleted`];
  }
  if (res === "panel-data") return ["Panel", `admin/data/${a}.json saved`];
  if (res === "stats" && method === "DELETE") return ["Statistics", "Reset"];
  return ["Silence", `${method} ${path}`];
}

/** Where the panel shows what an action changed (the link of its line in the console) */
export function whereIs(path) {
  const res = path.split("/")[1];
  if (path.startsWith("/config/auth")) return "#/overview/login";
  if (path.startsWith("/config/database") || res === "database") return "#/database/connection";
  if (path.startsWith("/config/server")) return "#/overview/server";
  if (res === "config") return "#/overview/advanced";
  if (res === "users") return "#/database/users";
  if (res === "endpoints") return "#/endpoints";
  if (res === "tests") return "#/endpoints";
  if (res === "panel-data") return "#/scenarios";
  if (res === "stats") return "#/stats";
  return undefined;
}
