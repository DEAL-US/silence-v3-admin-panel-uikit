// What each action on Silence (a call to its admin API that changes something) means, for the
// activity (Logs): its text and where the panel shows what it changed. Without DOM: it can be tested.

const onOff = (value) => (value ? "on" : "off");

/** The text of a change of silence.json: [source, message]. section and values: what changed */
function describeConfig(section, body) {
  if (section === "database") {
    return Object.keys(body).join() === "scripts"
      ? ["Database", `Scripts saved in silence.json: ${body.scripts.join(", ") || "none"}`]
      : ["Database", `Connection saved in silence.json: ${body.name ?? ""}`];
  }
  if (section === "auth") {
    if ("table" in body) {
      return ["Users", body.table
        ? `Users table linked: ${body.table} (identifier ${body.identifier}, password ${body.password}`
          + `${body.role ? `, role ${body.role}` : ""})`
        : "Users table unlinked"];
    }
    const said = [];
    if ("login" in body) said.push(`login ${onOff(body.login)}`);
    if ("password_mode" in body) {
      said.push(`passwords ${body.password_mode === "argon2" ? "encrypted (argon2)" : "as plain text"}`);
    }
    if ("token_max_age" in body) said.push(`sessions of ${body.token_max_age} s`);
    return ["Users", `Saved in silence.json: ${said.join(", ")}`];
  }
  return ["Settings", `${section ?? "silence.json"} saved in silence.json`];
}

/** The text of a change of a file of the project: [source, message] */
function describeFile(method, file, action) {
  if (file === "silence.json") return describeConfig(action?.section, action?.values ?? {});
  if (file === "admin/logs/requests.log") return ["Logs", "Log of requests deleted: the activity and the statistics start again"];
  const [folder, ...rest] = file.split("/");
  const name = rest.join("/").replace(/\.json$/, "");
  if (folder === "endpoints" || folder === "tests") {
    const kind = folder === "endpoints" ? "Endpoints" : "Tests";
    const target = action?.name ? `${name}/${action.name}` : `${folder}/${name}.json`;
    return [kind, `${target} ${action?.change ?? (method === "DELETE" ? "deleted" : "saved")}`];
  }
  return ["Silence", `${method} ${file}`];
}

/** The text of an action: [source, message]. body: what was sent; data: what Silence answered;
 *  action: what a change of a file means (see files.js) */
export function describe(method, path, body = {}, data = {}, action = null) {
  const clean = path.split("?")[0];
  if (clean.startsWith("/files/")) return describeFile(method, decodeURIComponent(clean.slice("/files/".length)), action);
  const [res, a, b] = clean.split("/").filter(Boolean).map(decodeURIComponent);
  body ??= {};
  data ??= {};

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
  if (res === "users" && b === "password") return ["Users", `Password of user ${a} changed`];
  if (res === "users" && b === "session") {
    const who = data.user ? Object.values(data.user).filter((v) => v !== null && v !== "" && typeof v !== "object") : [];
    return ["Users", `Session opened as user ${a}${who.length ? ` (${who.slice(0, 3).join(", ")})` : ""}`];
  }
  if (res === "endpoints" && a === "generate") {
    const tables = data.tables ?? [];
    return ["Endpoints", `Generated: ${tables.reduce((n, t) => n + t.generated.length, 0)} endpoints of ${tables.length} tables and views`];
  }
  return ["Silence", `${method} ${path}`];
}

/** Where the panel shows what an action changed (the link of its line in the activity) */
export function whereIs(path, action = null) {
  const clean = path.split("?")[0];
  if (clean.startsWith("/files/")) {
    const file = decodeURIComponent(clean.slice("/files/".length));
    if (file === "silence.json") {
      const section = action?.section;
      if (section === "auth") return "#/overview/login";
      if (section === "database") return "#/database/connection";
      if (section === "server") return "#/overview/server";
      return "#/overview/advanced";
    }
    if (file.startsWith("endpoints/") || file.startsWith("tests/")) return "#/endpoints";
    if (file.startsWith("admin/logs/")) return "#/logs";
    return undefined;
  }
  const res = clean.split("/")[1];
  if (res === "database") return "#/database/connection";
  if (res === "users") return "#/database/users";
  if (res === "endpoints") return "#/endpoints";
  return undefined;
}
