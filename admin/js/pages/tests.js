// Tests. Unit tests: the generated ones (Silence computes them from the endpoints whenever they are
// asked for, so they are always up to date; they are not edited, but they can be duplicated to
// start a custom one) and the custom ones (tests/<table>.json), e.g., for the business rules. Scenarios (sequences of unit tests, by name):
// the panel keeps them (scenarios.js). Silence does not run tests: the panel runs them against the
// student's API (they change the database: the database is reloaded first, if it can be).
// Views: #/tests (the unit tests, all in one grid), #/tests/new (/<name>: a copy of that test),
// #/tests/edit/<file>/<name> (a custom one) and
// #/tests/scenarios/... (scenarios.js).
import { html, link, iconButton, methodBadge, sourceBadge, muted, alertList, options } from "../lib/html.js";
import { api, quietApi } from "../lib/api.js";
import { attempt, toast, needsConfirm } from "../lib/ui.js";
import { parseUnit, sortForRun, expectText, routeParams, matchRoute, fillRoute, parseValue, valueText,
  buildDefinition } from "../lib/testing.js";
import { runUnit } from "../lib/runner.js";
import { dataTable } from "../components/table.js";
import { results, loadTests, testTabs, resultBadge, stepsDetail } from "./tests-common.js";
import * as scenarios from "./scenarios.js";

export function crumbs(params) {
  const [view, , name] = params;
  if (view === "scenarios") return scenarios.crumbs(params.slice(1));
  const base = [{ label: "Tests", href: "#/tests" }];
  if (view === "edit") return [...base, { label: `Edit ${name}` }];
  if (view === "new") return [...base, { label: "New unit test" }];
  return [...base, { label: "Unit tests" }];
}

export function parent(params) {
  const [view] = params;
  if (view === "scenarios") return scenarios.parent(params.slice(1));
  return view === "edit" || view === "new" ? "#/tests" : null;
}

export async function render(main, app, params) {
  const [view, file, name] = params;
  if (view === "scenarios") return scenarios.render(main, app, params.slice(1));
  if (view === "edit") return unitEditor(main, app, file, name);
  if (view === "new") return unitEditor(main, app, null, null, file);
  return unitList(main, app);
}

///////////////////////////////////////////////////////////////////////////////
// The grid of the unit tests
///////////////////////////////////////////////////////////////////////////////

async function unitList(main, app) {
  const [first, config] = await Promise.all([loadTests(), attempt(() => api("/config"))]);
  if (!first) return;
  let all = first;
  const scripts = config?.config.database.scripts ?? [];
  const resultOf = (t) => results.get("unit:" + t.name);
  const counts = () => {
    const n = (s) => all.units.filter((t) => t.source === s).length;
    return `${n("auto")} generated · ${n("custom")} custom`;
  };

  main.innerHTML = html`
    <h1>Tests</h1>
    <p class="uk-text-muted">Unit tests: one request each, and the status it should get. Silence generates them from the
      endpoints (they follow every change of the endpoints); yours, for example for the business rules, are the custom ones
      (<em>Duplicate</em> a generated test to start one from it).
      The panel sends them to your API in the order GET, POST, PUT, DELETE. <strong>They change the database</strong>:
      ${scripts.length ? "it is created again before running them, so they always start from the original data."
        : html`to start always from the original data, choose the scripts that create it in
          <a href="#/overview/advanced">Overview → Advanced</a>.`}</p>
    ${alertList("danger", "Tests not loaded", all.unitData.errors)}
    <div id="tabs">${testTabs("units", all)}</div>
    <div class="sa-toolbar">
      <button class="uk-button uk-button-primary" type="button" id="run">Run the tests shown</button>
      <a class="uk-button uk-button-default" href="#/tests/new">New unit test</a>
      <span class="sa-toolbar__spacer"></span>
      <span class="uk-text-muted sa-small" id="counts">${counts()}</span>
      <span id="summary" role="status"></span>
    </div>
    <div id="grid"></div>`;

  const table = dataTable(main.querySelector("#grid"), {
    rows: all.units, sort: { key: "name", dir: "asc" },
    empty: html`No tests: they are generated from the endpoints, and there are none. <a href="#/endpoints">Generate the
      endpoints first</a>.`,
    columns: [
      { key: "actions", label: "", filter: false, sortable: false, className: "sa-actions", render: (t) => html`
        ${iconButton("play", "Run", { action: "run" })}
        ${t.source === "auto"
          ? iconButton("copy", "Duplicate (a new custom test from this one)", { href: link("tests", "new", t.name) })
          : html`${iconButton("pencil", "Edit", { href: link("tests", "edit", t.file, t.name) })}
            ${iconButton("trash", "Delete", { action: "delete", danger: true })}`}` },
      { key: "result", label: "Result", filter: "select",
        value: (t) => (resultOf(t) ? (resultOf(t).passed ? "PASS" : "FAIL") : ""), render: (t) => resultBadge(resultOf(t)) },
      { key: "name", label: "Test", render: (t) => html`<strong>${t.name}</strong>` },
      { key: "request", label: "Request", className: "sa-nowrap", value: (t) => `${t.request.method} ${t.request.path}`,
        render: (t) => html`${methodBadge(t.request.method)} <span class="sa-route">${t.request.path}</span>` },
      { key: "as", label: "As user", filter: "select", value: (t) => ((t.request.as ?? null) === null ? "" : String(t.request.as)),
        render: (t) => ((t.request.as ?? null) === null ? muted() : html`${t.request.as}`) },
      { key: "expect", label: "Expects", filter: "select", value: (t) => expectText(t.expect) },
      { key: "table", label: "Table", filter: "select" },
      { key: "source", label: "Source", filter: "select", render: (t) => sourceBadge(t.source) },
    ],
    after: (t) => (resultOf(t) && !resultOf(t).passed ? stepsDetail(resultOf(t).steps) : ""),
    onAction: async (action, t, button) => {
      if (action === "run" && (t.request.method === "GET" || needsConfirm(button, "Run? It changes the database"))) run([t]);
      if (action === "delete" && needsConfirm(button, "Delete?")) remove(t);
    },
  });

  /** The tests again, in the same grid (its order and filters are kept) */
  async function refresh() {
    const res = await loadTests();
    if (res) {
      all = res;
      table.update(all.units);
      main.querySelector("#counts").textContent = counts();
      main.querySelector("#tabs").innerHTML = testTabs("units", all);
    }
    await app.refreshStatus();
  }

  async function remove(t) {
    if (!await attempt(() => api(`/tests/${t.file}/${t.name}`, "DELETE", undefined, all.unitData.files[t.file] ?? ""), "Deleted")) return;
    results.delete("unit:" + t.name);
    refresh();
  }

  function summary() {
    const done = all.units.filter((t) => resultOf(t));
    const passed = done.filter((t) => resultOf(t).passed).length;
    main.querySelector("#summary").innerHTML = done.length
      ? html`<span class="${passed === done.length ? "sa-pass" : "sa-fail"}">${passed} / ${done.length} passed</span>` : "";
  }

  async function run(tests, { reload = false } = {}) {
    const button = main.querySelector("#run");
    button.disabled = true;
    if (reload && !await attempt(() => api("/database/reload", "POST"))) {
      button.disabled = false;
      return;
    }
    const ordered = sortForRun(tests);
    const tokens = new Map();
    let passed = 0;
    for (const t of ordered) {
      const step = await runUnit(t.name, t, { source: `Test ${t.name}`, tokens });
      results.set("unit:" + t.name, { passed: step.passed, steps: [step] });
      if (step.passed) passed++;
    }
    button.disabled = false;
    toast(`${passed} of ${ordered.length} tests passed`, passed === ordered.length ? "success" : "warning");
    table.update(all.units);
    summary();
  }

  // The tests shown: from the original data (the database is created again first), if it can be
  const runButton = main.querySelector("#run");
  runButton.addEventListener("click", () => {
    const shown = table.visible();
    if (!shown.length) return toast("There are no tests to run", "info");
    const question = scripts.length ? `Create the database again and run ${shown.length}?` : `Run ${shown.length}? They change the database`;
    if ((scripts.length || shown.some((t) => t.request.method !== "GET")) && !needsConfirm(runButton, question)) return;
    run(shown, { reload: scripts.length > 0 });
  });
  summary();
}

///////////////////////////////////////////////////////////////////////////////
// Create (or duplicate) and edit a custom unit test
///////////////////////////////////////////////////////////////////////////////

// The common answers, to choose what a test expects
const STATUSES = [["", "Any 2xx (it works)"], [200, "200 OK"], [201, "201 Created"], [400, "400 Bad request"],
  [401, "401 Without a session"], [403, "403 Forbidden (role or owner)"], [404, "404 Not found"], [409, "409 Conflict"],
  [500, "500 Server error"]];

/** The endpoints that a test can call: the student's, and login and register (Silence's) */
async function callableEndpoints(app) {
  const eps = await attempt(() => api("/endpoints"));
  if (!eps) return null;
  const list = [...eps.endpoints].sort((a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method));
  const auth = app.status.auth;
  if (auth.linked) {
    const schema = await quietApi("/schema").catch(() => null);
    const users = schema?.relations.find((r) => r.name.toLowerCase() === auth.table.toLowerCase());
    const columns = (users?.columns ?? []).filter((c) => !c.autoIncrement && !c.generated).map((c) => c.name);
    const silence = (route, params) => ({ method: "POST", route, name: route.slice(1), table: auth.table,
      request_body_params: params, silence: true });
    if (auth.login) list.push(silence("/login", [auth.identifier.split(".").pop(), auth.password]));
    if (auth.register && !auth.identifier.includes(".")) list.push(silence("/register", columns));
  }
  return { apiPrefix: eps.apiPrefix, endpoints: list };
}

/** A custom unit test as a form, as an endpoint: the endpoint it calls (its params and body as
 *  fields), the user, and what it expects. Its file is the one of the endpoint's table, and its
 *  name is proposed. The JSON that is saved is shown, read-only. from: the name of the test that
 *  a new one copies (Duplicate). */
async function unitEditor(main, app, file, name, from) {
  const [all, eps] = await Promise.all([loadTests(), callableEndpoints(app)]);
  if (!all || !eps) return;
  const t = file ? all.units.find((x) => x.file === file && x.name === name && x.source === "custom") : null;
  const copied = from ? all.units.find((x) => x.name === from) : null;
  if ((file && !t) || (from && !copied)) {
    main.innerHTML = html`<div class="uk-alert uk-alert-danger">There is no custom test ${name ?? from}: the generated tests
      are not edited (<em>Duplicate</em> one to start a custom test from it).</div>`;
    return;
  }
  const base = t ?? copied;  // What the form starts from
  const generatedNames = new Set(all.units.filter((x) => x.source === "auto").map((x) => x.name));
  const users = (await quietApi("/users").catch(() => null))?.users ?? [];
  const endpoints = eps.endpoints;
  const key = (e) => `${e.method} ${e.route}`;
  // The endpoint of the test: the one it says, or the one whose route matches its request; if
  // none does, its request as it is written (kept as it is)
  const req = base?.request;
  let current = base ? endpoints.find((e) => key(e) === base.definition.endpoint)
    ?? endpoints.find((e) => e.method === req.method && matchRoute(e.route, req.path.split("?")[0])) : endpoints[0];
  if (base && !current) {
    current = { method: req.method, route: req.path, name: "request", table: base.table,
      request_body_params: Object.keys(req.body ?? {}), written: true };
    endpoints.push(current);
  }

  main.innerHTML = html`
    <h1>${t ? `Edit ${t.name}` : copied ? `New unit test from ${copied.name}` : "New unit test"}</h1>
    <p class="sa-small uk-text-muted">A unit test sends one request to an endpoint and checks the answer, for example that
      a business rule rejects some data. <em>Try it</em> sends it to your API: it may change the database.</p>
    <form id="test-form" class="sa-form sa-form--wide">
      <div class="sa-field"><label class="uk-form-label" for="t-name">Name</label>
        <input class="uk-input" id="t-name" name="name" value="${t?.name ?? ""}" required pattern="\\w+"></div>
      <div class="sa-field"><span class="uk-form-label">Saved in</span>
        <p class="uk-margin-small-top"><code id="t-file"></code></p></div>
      <div class="sa-field sa-span"><label class="uk-form-label" for="t-desc">Description</label>
        <input class="uk-input" id="t-desc" name="description" value="${t?.description ?? ""}"
          placeholder="What it checks, e.g. an employee who is not the boss cannot change a salary"></div>

      <h3 class="sa-span">Request</h3>
      <div class="sa-field sa-span"><label class="uk-form-label" for="t-endpoint">Endpoint</label>
        <select class="uk-select" id="t-endpoint" name="endpoint">
          ${options(endpoints.map((e, i) => [i, `${e.method} ${eps.apiPrefix}${e.route}${e.silence ? " (Silence)"
            : e.written ? " (as written in the test)" : ""}`]), current ? endpoints.indexOf(current) : "")}
        </select></div>
      <div class="sa-span sa-form" id="t-params"></div>
      <div class="sa-field"><label class="uk-form-label" for="t-as">As user</label>
        <select class="uk-select" id="t-as" name="as">${options(users.map((u) => [u.id, `${u.identifier}${u.role ? ` (${u.role})` : ""}`]),
          req?.as ?? "", "Without a session")}</select></div>

      <h3 class="sa-span">It expects</h3>
      <div class="sa-field"><label class="uk-form-label" for="t-status">Status</label>
        <select class="uk-select" id="t-status" name="status">${options(STATUSES, base?.expect.status ?? "")}</select></div>
      <div class="sa-field"><label class="uk-form-label" for="t-message">A message that contains (optional)</label>
        <input class="uk-input" id="t-message" name="message" value="${base?.expect.message ?? ""}" placeholder="e.g. validSalary"></div>

      <details class="sa-span"><summary class="uk-text-muted sa-small">The test as it is saved</summary>
        <pre class="sa-pre" id="t-json"></pre></details>
      <div class="sa-toolbar sa-span">
        <button class="uk-button uk-button-primary" type="submit">Save</button>
        <button class="uk-button uk-button-default" type="button" id="t-try">Try it</button>
        <a class="uk-button uk-button-default" href="#/tests">Cancel</a>
      </div>
    </form>
    <div id="t-result" role="status"></div>`;

  const form = main.querySelector("#test-form");
  const nameField = form.querySelector("#t-name");
  const endpointOf = () => endpoints[Number(form.querySelector("#t-endpoint").value)];
  // The file: the one of a custom test, or the one of the endpoint's table
  const fileOf = () => (t && endpointOf() === current ? t.file : endpointOf().table);
  // The name is proposed (table_endpoint_status) until the student writes one
  let nameTyped = Boolean(t);
  const proposeName = () => {
    if (nameTyped) return;
    const e = endpointOf();
    const proposed = `${e.table}_${e.name ?? e.method.toLowerCase()}_${form.querySelector("#t-status").value || "2xx"}`
      .replace(/\W+/g, "_");
    // Not the name of another test (e.g., two tests of the same endpoint and status)
    const taken = new Set(all.units.map((x) => x.name));
    let n = 1;
    let candidate = proposed;
    while (taken.has(candidate)) candidate = `${proposed}_${++n}`;
    nameField.value = candidate;
  };
  // The values typed so far, by field, so as not to lose them when the endpoint changes
  const typed = {
    ...Object.fromEntries(Object.entries(current && req ? matchRoute(current.route, req.path.split("?")[0]) ?? {} : {})
      .map(([k, v]) => [`param:${k}`, v])),
    ...Object.fromEntries(Object.entries(req?.body ?? {}).map(([k, v]) => [`body:${k}`, valueText(v)])),
  };

  function drawParams() {
    const e = endpointOf();
    if (!e) return;
    const params = routeParams(e.route);
    const body = e.method === "POST" || e.method === "PUT" ? e.request_body_params ?? [] : [];
    const input = (kind, p, help) => html`<div class="sa-field"><label class="uk-form-label" for="t-${kind}-${p}">${help}</label>
      <input class="uk-input" id="t-${kind}-${p}" name="${kind}:${p}" value="${typed[`${kind}:${p}`] ?? ""}"
        ${kind === "param" ? "required" : html`placeholder="(left out if empty)"`}></div>`;
    form.querySelector("#t-params").innerHTML = html`
      ${params.map((p) => input("param", p, `$${p} (in the route)`))}
      ${body.map((p) => input("body", p, `${p} (in the body)`))}
      ${!params.length && !body.length ? html`<p class="uk-text-muted sa-small">This endpoint has no params.</p>` : ""}`;
  }

  /** The test of the form: its definition (as it is saved) */
  function definition() {
    const e = endpointOf();
    const v = Object.fromEntries(new FormData(form));
    const params = Object.fromEntries(routeParams(e.route).map((p) => [p, v[`param:${p}`] ?? ""]));
    const bodyParams = e.method === "POST" || e.method === "PUT" ? e.request_body_params ?? [] : null;
    return buildDefinition({
      description: v.description.trim(),
      endpoint: e.silence || e.written ? base?.definition.endpoint : key(e),
      method: e.method,
      path: fillRoute(e.route, params),
      body: bodyParams && Object.fromEntries(bodyParams.map((p) => [p, parseValue(v[`body:${p}`])])),
      as: v.as,
      expect: { status: parseValue(v.status), message: v.message.trim() || undefined },
    });
  }

  const update = () => {
    proposeName();
    form.querySelector("#t-file").textContent = `tests/${fileOf()}.json`;
    form.querySelector("#t-json").textContent = JSON.stringify(definition(), null, 2);
  };
  form.querySelector("#t-endpoint").addEventListener("change", drawParams);
  // Once the student goes to the name, it is theirs: it is not proposed any more
  nameField.addEventListener("focus", () => {
    nameTyped = true;
  });
  form.addEventListener("input", (event) => {
    if (event.target.name?.includes(":")) typed[event.target.name] = event.target.value;
    update();
  });
  form.addEventListener("change", update);
  drawParams();
  update();

  main.querySelector("#t-try").addEventListener("click", async () => {
    if (!form.reportValidity()) return;
    const step = await runUnit(nameField.value || "(not saved)", parseUnit(definition()), { source: "Try test" });
    main.querySelector("#t-result").innerHTML = html`<h2>Result</h2>${stepsDetail([step])}`;
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const newName = nameField.value;
    const newFile = fileOf();
    if (generatedNames.has(newName)) return toast(`${newName} is the name of a generated test: choose another one`, "error");
    const saved = await attempt(() => api(`/tests/${encodeURIComponent(newFile)}/${encodeURIComponent(newName)}`, "PUT",
      definition(), all.unitData.files[newFile] ?? ""), `Saved in tests/${newFile}.json`);
    if (!saved) return;
    if (t && (t.name !== newName || t.file !== newFile)) {  // Renamed or moved: remove the old one
      const etag = t.file === newFile ? saved.etag : all.unitData.files[t.file] ?? "";
      await attempt(() => api(`/tests/${t.file}/${t.name}`, "DELETE", undefined, etag));
    }
    location.hash = "#/tests";
  });
}
