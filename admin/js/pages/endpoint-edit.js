// Create or edit a custom endpoint (#/endpoints/new, #/endpoints/edit/<file>/<name>): what it does.
// The student writes its method, route, SQL and description; the rest is worked out from them as
// Silence does (server/endpoints.py): where each $param of the SQL comes from (the route, the query
// string, the body or the session), the function of the JS API, its file and the checks. A new one
// may start from a table and a kind (list, one row, create, update, delete). Its access is changed
// in the grid; here it is kept as it is (a new one is public).
import { html, pageHead, link } from "../lib/html.js";
import { api, loadEndpoints } from "../lib/api.js";
import { quietReadFile, endpointsFile, moveEntry } from "../lib/files.js";
import { attempt } from "../lib/ui.js";
import { anyRole } from "../lib/access.js";

const METHODS = ["GET", "POST", "PUT", "DELETE"];
// The operation that each method usually runs (Silence warns otherwise)
const EXPECTED = { GET: "SELECT", POST: "INSERT", PUT: "UPDATE", DELETE: "DELETE" };

/** The $params of a text, in order and once */
const paramsOf = (text) => [...new Set([...String(text).matchAll(/\$(\w+)/g)].map((m) => m[1]))];
/** The operation of a SQL statement (SELECT, INSERT…) */
const opOf = (sql) => (String(sql).trim().match(/^\(?\s*(\w+)/)?.[1] ?? "").toUpperCase();
/** The table of a SQL statement: after FROM, INTO, UPDATE or DELETE FROM */
const tableOf = (sql) => String(sql).match(/\b(?:from|into|update)\s+`?(\w+)`?/i)?.[1] ?? "";
const pascal = (s) => String(s).split(/[_\W]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("");

/** A name for the function of an endpoint, from its method and route: GET /grades → getAll,
 *  GET /grades/$grade_id → getById, GET /grades/minValue → getMinValue, POST /grades → create */
function proposedName(method, route, pk) {
  const verb = { GET: "get", POST: "create", PUT: "update", DELETE: "delete" }[method] ?? "call";
  const segments = route.split("/").filter(Boolean).slice(1);
  if (!segments.length) return method === "GET" ? "getAll" : verb;
  if (segments.length === 1 && segments[0].startsWith("$") && (!pk || segments[0].slice(1) === pk)) {
    return method === "GET" ? "getById" : verb;
  }
  return verb + segments.map((s) => (s.startsWith("$") ? `By${pascal(s.slice(1))}` : pascal(s))).join("");
}

/** The kinds of endpoint that a new one may start from, for a table of the schema */
function templates(r) {
  const pk = r.pk[0] ?? "id";
  const cols = r.columns.filter((c) => !c.autoIncrement && !c.generated).map((c) => c.name);
  const list = cols.join(", ");
  return {
    list: { label: "List", method: "GET", route: `/${r.name}`, sql: `SELECT * FROM ${r.name}`,
      description: `The rows of ${r.name}` },
    one: { label: "One row", method: "GET", route: `/${r.name}/$${pk}`, sql: `SELECT * FROM ${r.name} WHERE ${pk} = $${pk}`,
      description: `A row of ${r.name}, by its ${pk}` },
    create: { label: "Create", method: "POST", route: `/${r.name}`,
      sql: `INSERT INTO ${r.name}(${list})\nVALUES (${cols.map((c) => `$${c}`).join(", ")})`, description: `Creates a row of ${r.name}` },
    update: { label: "Update", method: "PUT", route: `/${r.name}/$${pk}`,
      sql: `UPDATE ${r.name}\nSET ${cols.map((c) => `${c} = $${c}`).join(",\n    ")}\nWHERE ${pk} = $${pk}`,
      description: `Updates a row of ${r.name}, by its ${pk}` },
    delete: { label: "Delete", method: "DELETE", route: `/${r.name}/$${pk}`, sql: `DELETE FROM ${r.name} WHERE ${pk} = $${pk}`,
      description: `Deletes a row of ${r.name}, by its ${pk}` },
  };
}

export async function render(main, app, file, name) {
  const [data, schema] = await Promise.all([attempt(() => loadEndpoints({ quiet: true })), attempt(() => api("/schema"))]);
  if (!data || !schema) return;
  const ep = file ? data.endpoints.find((e) => e.file === file && e.name === name) : null;
  if (file && !ep) {
    main.innerHTML = html`<div class="uk-alert uk-alert-danger">There is no endpoint ${name} in ${file}.json.</div>`;
    return;
  }
  const relations = schema.relations;
  const relationOf = (t) => relations.find((r) => r.name.toLowerCase() === String(t).toLowerCase());
  // Where each param comes from when it could come from two places (POST and PUT: the body or the
  // query string), as the endpoint has it or as the student chooses
  const origin = new Map();
  for (const p of ep?.query_params ?? []) origin.set(p, "query");
  for (const p of ep?.request_body_params ?? []) origin.set(p, "body");
  // The name and the file are proposed until the student changes them
  let nameTyped = Boolean(ep);
  let fileTyped = Boolean(ep);

  main.innerHTML = html`
    ${pageHead(ep ? html`Edit <span class="sa-route">${ep.method} ${data.apiPrefix + ep.route}</span>` : "New custom endpoint")}
    <form id="edit-form" class="sa-epform" novalidate>
      ${ep ? "" : html`<div class="sa-epform__start">
        <span class="uk-form-label">Start from</span>
        <select class="uk-select uk-form-small uk-form-width-medium" id="ep-table" aria-label="Table">
          <option value="">a table…</option>
          ${relations.map((r) => html`<option value="${r.name}">${r.name}${r.view ? " (view)" : ""}</option>`)}
        </select>
        <span class="sa-epform__kinds" id="ep-kinds"></span>
      </div>`}
      <div class="sa-epform__request">
        <select class="uk-select sa-epform__method" id="ep-method" aria-label="Method">
          ${METHODS.map((m) => html`<option ${m === (ep?.method ?? "GET") ? "selected" : ""}>${m}</option>`)}</select>
        <span class="sa-epform__prefix">${data.apiPrefix}</span>
        <input class="uk-input sa-route" id="ep-route" aria-label="Route" value="${ep?.route ?? "/"}"
          placeholder="/grades/$grade_id" autocomplete="off" spellcheck="false">
      </div>
      <input class="uk-input" id="ep-desc" aria-label="Description" value="${ep?.description ?? ""}"
        placeholder="What it does, e.g. The grades of a student">
      <div class="sa-epform__sql">
        <div>
          <label class="uk-form-label" for="ep-sql">SQL</label>
          <textarea class="uk-textarea sa-code" id="ep-sql" spellcheck="false" rows="7">${ep?.sql ?? ""}</textarea>
        </div>
        <aside class="sa-epform__columns" id="ep-columns"></aside>
      </div>
      <div class="sa-epform__box">
        <h3>Params</h3>
        <div id="ep-params"></div>
        <p class="sa-epform__example" id="ep-example"></p>
      </div>
      <div class="sa-epform__box sa-epform__js">
        <label class="uk-form-label" for="ep-name">Function of the JS API</label>
        <div class="sa-epform__fn"><input class="uk-input sa-route" id="ep-name" value="${ep?.name ?? ""}" spellcheck="false"
          aria-label="Name"><code id="ep-args"></code></div>
        <p class="sa-small uk-text-muted">In <code id="ep-jsfile"></code>; the endpoint is saved in
          <code>endpoints/<input class="sa-epform__file" id="ep-file" value="${ep?.file ?? ""}" aria-label="File"
          spellcheck="false">.json</code></p>
      </div>
      <ul class="sa-epform__checks" id="ep-checks"></ul>
      <div class="sa-toolbar">
        <button class="uk-button uk-button-primary" type="submit" data-then="list">Save</button>
        <button class="uk-button uk-button-default" type="submit" data-then="try">Save and try</button>
        <a class="uk-button uk-button-default" href="#/endpoints">Cancel</a>
      </div>
    </form>`;

  const $ = (sel) => main.querySelector(sel);
  const form = $("#edit-form");
  const fields = { method: $("#ep-method"), route: $("#ep-route"), desc: $("#ep-desc"), sql: $("#ep-sql"),
    name: $("#ep-name"), file: $("#ep-file") };

  /** The endpoint as the form says it, with where each param comes from */
  function current() {
    const method = fields.method.value;
    const route = `/${fields.route.value.trim().replace(/^\/+/, "")}`;
    const sql = fields.sql.value;
    const op = opOf(sql);
    const inRoute = paramsOf(route);
    const table = tableOf(sql) || route.split("/")[1] || "";
    const params = paramsOf(sql).map((p) => {
      if (p === "loggedId") return { p, from: "session" };
      if (inRoute.includes(p)) return { p, from: "route" };
      // In a POST with owner, the owner's column comes from the session (Silence fills it in)
      if (ep?.owner && op === "INSERT" && p.toLowerCase() === ep.owner.toLowerCase()) return { p, from: "owner" };
      // A SELECT or a DELETE has no body: the query string
      const canBody = !["SELECT", "DELETE"].includes(op) && ["POST", "PUT"].includes(method);
      const chosen = origin.get(p);
      return { p, from: canBody ? (chosen ?? "body") : "query", choice: canBody };
    });
    return { method, route, sql, op, table, params, unused: inRoute.filter((p) => !paramsOf(sql).includes(p)),
      name: fields.name.value.trim(), file: fields.file.value.trim(), description: fields.desc.value.trim() };
  }

  const FROM = { route: "the route", query: "the query string", body: "the body (JSON)", session: "the logged-in user",
    owner: "the logged-in user (owner)" };

  function draw() {
    const c = current();
    // Proposed name and file, until the student writes them
    const pk = relationOf(c.table)?.pk[0];
    if (!nameTyped) fields.name.value = proposedName(c.method, c.route, pk);
    if (!fileTyped) fields.file.value = c.table;
    const name = fields.name.value.trim();
    const file = fields.file.value.trim();
    fields.file.style.width = `${Math.max(4, file.length + 1)}ch`;  // As wide as its name

    // The columns of its table, to insert them in the SQL
    const r = relationOf(c.table);
    $("#ep-columns").innerHTML = r ? html`<p class="uk-form-label">Columns of ${r.name}</p>
      ${r.columns.map((col) => html`<button type="button" class="sa-chip" data-insert="${col.name}"
        title="${col.type}${col.nullable ? ", may be NULL" : ""}${r.pk.includes(col.name) ? ", primary key" : ""}">${col.name}</button>`)}` : "";

    // The params and where each one comes from
    $("#ep-params").innerHTML = c.params.length || c.unused.length ? html`<table class="uk-table uk-table-small sa-epform__params"><tbody>
      ${c.params.map(({ p, from, choice }) => html`<tr><td><code>$${p}</code></td><td>${choice
        ? html`<select class="uk-select uk-form-small" data-origin="${p}" aria-label="Where $${p} comes from">
            <option value="body" ${from === "body" ? "selected" : ""}>${FROM.body}</option>
            <option value="query" ${from === "query" ? "selected" : ""}>${FROM.query}</option></select>`
        : FROM[from]}</td></tr>`)}
      ${c.unused.map((p) => html`<tr><td><code>$${p}</code></td><td class="uk-text-warning">the route, but the SQL does not use it</td></tr>`)}
      </tbody></table>` : html`<p class="uk-text-muted sa-small">The SQL has no <code>$params</code>.</p>`;

    // The request, as it is called
    const query = c.params.filter((x) => x.from === "query").map((x) => `${x.p}=…`).join("&");
    const body = c.params.filter((x) => x.from === "body").map((x) => x.p);
    $("#ep-example").innerHTML = html`<span class="sa-method sa-method--${c.method}">${c.method}</span>
      <span class="sa-route">${data.apiPrefix}${c.route.replace(/\$(\w+)/g, "{$1}")}${query ? `?${query}` : ""}</span>
      ${body.length ? html`<code class="sa-epform__body">{${body.map((b) => `"${b}": …`).join(", ")}}</code>` : ""}`;

    // Its function in the JS API (as Silence writes it: the form's data first, then the params)
    const args = [...(body.length ? ["formData"] : []), ...paramsOf(c.route), ...c.params.filter((x) => x.from === "query").map((x) => x.p)];
    $("#ep-args").textContent = `(${args.join(", ")})`;
    $("#ep-jsfile").textContent = `js/api/_auto/${file || "…"}.js`;

    // The checks: ✖ cannot be saved, ⚠ Silence warns
    const errors = [];
    const warnings = [];
    if (!/^\w+$/.test(name)) errors.push("The function needs a name (letters, digits and _)");
    if (!/^[\w-]+$/.test(file)) errors.push("The file needs a name (letters, digits, _ and -)");
    if (!c.sql.trim()) errors.push("Write its SQL");
    const sameName = data.endpoints.find((e) => e !== ep && e.file === file && e.name === name);
    if (sameName) errors.push(`There is already a ${name} in endpoints/${file}.json`);
    const key = (m, rt) => `${m} ${rt.replace(/\$\w+/g, "$")}`;
    const same = data.endpoints.filter((e) => e !== ep && key(e.method, e.route) === key(c.method, c.route));
    if (same.some((e) => e.source === "custom")) errors.push(`There is already a custom ${c.method} ${c.route}`);
    else if (same.length) warnings.push(`It replaces the autogenerated ${c.method} ${same[0].route}`);
    if (c.op && c.op !== "CALL" && EXPECTED[c.method] && c.op !== EXPECTED[c.method]) {
      warnings.push(`${c.method} usually runs a ${EXPECTED[c.method]}, not a ${c.op}`);
    }
    const isPublic = !ep || (!ep.auth_required && !ep.owner && anyRole(ep));
    if (c.params.some((x) => x.from === "session") && isPublic) {
      warnings.push("It uses $loggedId and anybody can call it: without a session, $loggedId is NULL");
    }
    if (c.sql.trim() && !r && c.table) warnings.push(`There is no table ${c.table} in the database`);
    $("#ep-checks").innerHTML = html`${errors.map((t) => html`<li class="sa-fail">✖ ${t}</li>`)}${warnings.map((t) =>
      html`<li class="uk-text-warning">⚠ ${t}</li>`)}`;
    main.querySelectorAll("[type=submit]").forEach((b) => {
      b.disabled = errors.length > 0;
    });
  }

  // A new one, from a table and a kind
  const tableSelect = $("#ep-table");
  tableSelect?.addEventListener("change", () => {
    const r = relationOf(tableSelect.value);
    $("#ep-kinds").innerHTML = r ? html`${Object.entries(templates(r)).map(([k, t]) => html`<button type="button"
      class="uk-button uk-button-default uk-button-small" data-kind="${k}">${t.label}</button>`)}` : "";
  });
  $("#ep-kinds")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-kind]");
    const r = relationOf(tableSelect.value);
    if (!button || !r) return;
    const t = templates(r)[button.dataset.kind];
    Object.assign(fields.method, { value: t.method });
    fields.route.value = t.route;
    fields.sql.value = t.sql;
    fields.desc.value = t.description;
    nameTyped = false;
    fileTyped = false;
    origin.clear();
    draw();
  });

  // The columns: a click writes the name where the cursor is
  $("#ep-columns").addEventListener("click", (event) => {
    const chip = event.target.closest("[data-insert]");
    if (!chip) return;
    const ta = fields.sql;
    const [a, b] = [ta.selectionStart, ta.selectionEnd];
    ta.value = ta.value.slice(0, a) + chip.dataset.insert + ta.value.slice(b);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = a + chip.dataset.insert.length;
    draw();
  });
  $("#ep-params").addEventListener("change", (event) => {
    const select = event.target.closest("[data-origin]");
    if (select) origin.set(select.dataset.origin, select.value);
    draw();
  });
  fields.name.addEventListener("input", () => {
    nameTyped = true;
    draw();
  });
  fields.file.addEventListener("input", () => {
    fileTyped = true;
    draw();
  });
  for (const f of [fields.method, fields.route, fields.sql, fields.desc]) f.addEventListener("input", draw);
  fields.method.addEventListener("change", draw);
  draw();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const then = event.submitter?.dataset.then ?? "list";
    const c = current();
    const old = ep && { path: endpointsFile(ep.file), name: ep.name,
      definition: (await quietReadFile(endpointsFile(ep.file)).catch(() => ({}))).data?.[ep.name] };
    // What this page does not show (the access and whether it is published, changed in the grid) is
    // kept as it is; a new endpoint is public
    const def = { ...(old?.definition ?? { auth_required: false, allowed_roles: ["*"] }),
      description: c.description, route: c.route, method: c.method, sql: c.sql };
    delete def.request_body_params;
    delete def.query_params;
    const body = c.params.filter((x) => x.from === "body").map((x) => x.p);
    const query = c.params.filter((x) => x.from === "query").map((x) => x.p);
    if (body.length) def.request_body_params = body;
    if (query.length) def.query_params = query;
    const saved = await attempt(() => moveEntry(old?.definition ? old : null, endpointsFile(c.file), c.name, def),
      `Saved in endpoints/${c.file}.json`);
    if (!saved) return;
    await app.refreshStatus();
    location.hash = then === "try" ? link("endpoints", "try", c.file, c.name) : "#/endpoints";
  });
}
