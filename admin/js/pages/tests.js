// The editor of the custom unit tests (the tests are seen and run in Endpoints): a request to an
// endpoint and what it expects, e.g., that a business rule rejects some data. Views (second-level
// pages of Endpoints): #/tests/new, #/tests/endpoint/<file>/<name> (a new test of that endpoint),
// #/tests/new/<test> (a custom test from another one, e.g., a generated test that fails) and
// #/tests/edit/<file>/<name>. #/tests goes to Endpoints.
import { html } from "../lib/html.js";
import { attempt, toast } from "../lib/ui.js";
import { moveEntry, testsFile } from "../lib/files.js";
import { parseUnit } from "../lib/testing.js";
import { runUnit } from "../lib/runner.js";
import { requestForm, requestContext, endpointKey } from "../components/request-form.js";
import { results, loadTests, stepsDetail } from "./tests-common.js";

export function crumbs(params) {
  const [view, , name] = params;
  const base = [{ label: "Endpoints", href: "#/endpoints" }];
  return [...base, { label: view === "edit" ? `Edit the test ${name}` : "New test" }];
}

export const parent = () => "#/endpoints";

export async function render(main, app, params) {
  const [view, a, b] = params;
  if (view === "edit") return editor(main, app, { file: a, name: b });
  if (view === "new") return editor(main, app, { from: a });
  if (view === "endpoint") return editor(main, app, { endpointFile: a, endpointName: b });
  location.replace("#/endpoints");
  return undefined;
}

async function editor(main, app, { file, name, from, endpointFile, endpointName }) {
  const [all, context] = await Promise.all([loadTests(), requestContext(app)]);
  if (!all || !context) return;
  const t = file ? all.units.find((x) => x.file === file && x.name === name && x.source === "custom") : null;
  const copied = from ? all.units.find((x) => x.name === from) : null;
  if ((file && !t) || (from && !copied)) {
    main.innerHTML = html`<div class="uk-alert uk-alert-danger">There is no custom test ${name ?? from}: the generated tests
      are not edited (create a custom test from one instead).</div>`;
    return;
  }
  // A copy of a test that failed expects what the API answered, for the student to decide
  const last = copied && results.get("unit:" + copied.name);
  const answered = last && !last.passed ? last.steps[0] : null;
  const base = t ?? (copied && {
    ...copied,
    expect: answered ? { status: answered.status, message: answered.status >= 400 ? answered.response?.message : undefined }
      : copied.expect,
  });
  const forEndpoint = endpointFile ? context.endpoints.find((e) => e.file === endpointFile && e.name === endpointName) : null;
  const generatedNames = new Set(all.units.filter((x) => x.source === "auto").map((x) => x.name));

  main.innerHTML = html`
    <div class="sa-pagehead"><h1>${t ? `Edit the test ${t.name}` : copied ? `New test from ${copied.name}` : "New test"}</h1></div>
    <p class="sa-small uk-text-muted">A test sends one request to an endpoint and checks the answer, for example that a
      business rule rejects some data. <em>Try it</em> sends it to your API: it may change the database.
      ${answered ? html`<br><strong>${copied.name}</strong> expected ${copied.expect.status ?? "a 2xx"} and your API answered
        ${answered.status}: this test expects what it answered; change it if that is not what it should do.` : ""}</p>
    <form id="test-form" class="sa-form sa-form--wide">
      <div class="sa-field"><label class="uk-form-label" for="t-name">Name</label>
        <input class="uk-input" id="t-name" value="${t?.name ?? ""}" required pattern="\\w+"></div>
      <div class="sa-field"><span class="uk-form-label">Saved in</span>
        <p class="uk-margin-small-top"><code id="t-file"></code></p></div>
      <div class="sa-field sa-span"><label class="uk-form-label" for="t-desc">Description</label>
        <input class="uk-input" id="t-desc" value="${t?.description ?? copied?.description ?? ""}"
          placeholder="What it checks, e.g. a negative salary breaks the rule validSalary"></div>
      <div class="sa-span sa-form sa-form--wide" id="t-request"></div>
      <details class="sa-span"><summary class="uk-text-muted sa-small">The test as it is saved</summary>
        <pre class="sa-pre" id="t-json"></pre></details>
      <div class="sa-toolbar sa-span">
        <button class="uk-button uk-button-primary" type="submit">Save</button>
        <button class="uk-button uk-button-default" type="button" id="t-try">Try it</button>
        <a class="uk-button uk-button-default" href="#/endpoints">Cancel</a>
      </div>
    </form>
    <div id="t-result" role="status"></div>`;

  const form = main.querySelector("#test-form");
  const nameField = form.querySelector("#t-name");
  const request = requestForm(form.querySelector("#t-request"), {
    context, base, endpoint: forEndpoint && endpointKey(forEndpoint), id: "t", onChange: () => update(),
  });
  // The file: the one of a custom test (while its endpoint is the same), or the one of the endpoint's table
  const initial = request.endpoint();
  const fileOf = () => (t && request.endpoint() === initial ? t.file : request.endpoint().table ?? t?.table ?? "tests");
  // The name is proposed (table_endpoint_status) until the student goes to it
  let nameTyped = Boolean(t);
  nameField.addEventListener("focus", () => {
    nameTyped = true;
  });
  const proposeName = () => {
    if (nameTyped) return;
    const e = request.endpoint();
    const status = request.definition().expect;
    const proposed = `${e.table ?? "test"}_${e.name ?? e.method.toLowerCase()}_${(typeof status === "number" ? status : status?.status) ?? "2xx"}`
      .replace(/\W+/g, "_");
    const taken = new Set(all.units.map((x) => x.name));
    let n = 1;
    let candidate = proposed;
    while (taken.has(candidate)) candidate = `${proposed}_${++n}`;
    nameField.value = candidate;
  };
  const definition = () => request.definition({ description: form.querySelector("#t-desc").value.trim() });
  function update() {
    proposeName();
    form.querySelector("#t-file").textContent = `tests/${fileOf()}.json`;
    form.querySelector("#t-json").textContent = JSON.stringify(definition(), null, 2);
  }
  form.querySelector("#t-desc").addEventListener("input", update);
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
    const old = t && { path: testsFile(t.file), name: t.name, definition: t.definition };
    const saved = await attempt(() => moveEntry(old, testsFile(newFile), newName, definition()), `Saved in tests/${newFile}.json`);
    if (saved) location.hash = "#/endpoints";
  });
}
