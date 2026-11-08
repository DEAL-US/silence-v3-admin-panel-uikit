// Scenarios: sequences of requests to the student's API (e.g., create, read, change and delete a
// row), each step written as a unit test (the endpoint, its params, the user and what it expects),
// kept by the panel (admin/data/scenarios.json) and run step by step against the student's API
// (they change the database). Views: #/scenarios, #/scenarios/new and #/scenarios/edit/<name>.
import { html, link, iconButton, methodBadge } from "../lib/html.js";
import { api } from "../lib/api.js";
import { readConfig } from "../lib/files.js";
import { beginGroup, endGroup } from "../lib/log.js";
import { attempt, toast, needsConfirm } from "../lib/ui.js";
import { runScenario, runUnit } from "../lib/runner.js";
import { dataTable } from "../components/table.js";
import { orderedList } from "../components/ordered-list.js";
import { requestForm, requestContext } from "../components/request-form.js";
import { results, loadScenarios, saveScenarios, stepUnit, resultBadge, stepsDetail } from "./tests-common.js";

export function crumbs(params) {
  const [view, name] = params;
  const base = [{ label: "Scenarios", href: "#/scenarios" }];
  if (view === "edit") return [...base, { label: name }];
  if (view === "new") return [...base, { label: "New scenario" }];
  return [{ label: "Scenarios" }];
}

export function parent(params) {
  return params[0] === "edit" || params[0] === "new" ? "#/scenarios" : null;
}

export function render(main, app, params) {
  const [view, name] = params;
  if (view === "edit") return editor(main, app, name);
  if (view === "new") return editor(main, app, null);
  return list(main, app);
}

/** A step in one line: the request, the user and what it expects */
function stepLine(step) {
  const unit = stepUnit(step);
  if (!unit) return html`<span class="uk-text-danger">Not valid</span>`;
  const r = unit.request;
  return html`${methodBadge(r.method)} <span class="sa-route">${r.path}</span>
    ${r.as !== null && r.as !== undefined ? html`<span class="uk-text-muted">as ${r.as}</span>` : ""}
    → ${unit.expect.status ?? "2xx"}${unit.expect.message ? html` <span class="uk-text-muted">“${unit.expect.message}”</span>` : ""}
    ${step.description ? html`<span class="uk-text-muted sa-small">· ${step.description}</span>` : ""}`;
}

async function list(main, app) {
  const [data, config] = await Promise.all([loadScenarios(), attempt(() => readConfig())]);
  if (!data) return;
  const scripts = config?.config.database.scripts ?? [];
  const resultOf = (s) => results.get("scenario:" + s.name);

  main.innerHTML = html`
    <h1>Scenarios</h1>
    <p class="uk-text-muted">A scenario is a sequence of requests to your API, run one after another by this panel (e.g.,
      create a row, read it, change it and delete it). A step that logs in gives its session to the next steps.
      <strong>They change the database</strong>${scripts.length ? ": it is created again before running one" : ""}. The
      panel saves them in <code>admin/data/scenarios.json</code>.</p>
    <div class="sa-toolbar"><a class="uk-button uk-button-primary" href="#/scenarios/new">New scenario</a></div>
    <div id="grid"></div>`;

  const table = dataTable(main.querySelector("#grid"), {
    rows: data.scenarios, sort: { key: "name", dir: "asc" },
    empty: html`No scenarios yet: <a href="#/scenarios/new">create one</a> with the requests in the order to send them.`,
    columns: [
      { key: "actions", label: "", filter: false, sortable: false, className: "sa-actions", render: (s) => html`
        ${iconButton("play", "Run (it changes the database)", { action: "run" })}
        ${iconButton("pencil", "Edit", { href: link("scenarios", "edit", s.name) })}
        ${iconButton("trash", "Delete", { action: "delete", danger: true })}` },
      { key: "result", label: "Result", filter: "select",
        value: (s) => (resultOf(s) ? (resultOf(s).passed ? "PASS" : "FAIL") : ""), render: (s) => resultBadge(resultOf(s)) },
      { key: "name", label: "Scenario", render: (s) => html`<strong>${s.name}</strong>
        ${s.description ? html`<br><span class="uk-text-muted sa-small">${s.description}</span>` : ""}` },
      { key: "steps", label: "Steps", filter: false, value: (s) => s.steps.length },
    ],
    after: (s) => (resultOf(s) && !resultOf(s).passed ? stepsDetail(resultOf(s).steps) : ""),
    onAction: async (action, s, button) => {
      const question = scripts.length ? "Create the database again and run it?" : "Run? It changes the database";
      if (action === "run" && needsConfirm(button, question)) {
        if (scripts.length && !await attempt(() => api("/database/reload", "POST"))) return;
        beginGroup("Scenario", `Run the scenario ${s.name}`, link("scenarios", "edit", s.name));
        const r = await runScenario(s, s.steps.map(stepUnit));
        endGroup(`${r.passed ? "passed" : "failed"} (${r.steps.filter((x) => x.passed).length} of ${s.steps.length} steps)`, r.passed);
        results.set("scenario:" + s.name, r);
        toast(`${s.name}: ${r.passed ? "passed" : "failed"} (${r.steps.filter((x) => x.passed).length} of ${s.steps.length} steps)`,
          r.passed ? "success" : "warning");
        table.update(data.scenarios);
      }
      if (action === "delete" && needsConfirm(button, "Delete?")) {
        if (await saveScenarios(data.scenarios.filter((x) => x.name !== s.name), data.etag)) {
          results.delete("scenario:" + s.name);
          toast("Deleted", "success");
          list(main, app);
        }
      }
    },
  });
}

async function editor(main, app, name) {
  const [data, context] = await Promise.all([loadScenarios(), requestContext(app)]);
  if (!data || !context) return;
  const original = name ? data.scenarios.find((s) => s.name === name) : null;
  if (name && !original) {
    main.innerHTML = html`<div class="uk-alert uk-alert-danger">There is no scenario ${name}.</div>`;
    return;
  }

  main.innerHTML = html`
    <h1>${original ? `Edit ${original.name}` : "New scenario"}</h1>
    <form id="scenario-form">
      <div class="sa-form">
        <div class="sa-field"><label class="uk-form-label" for="s-name">Name</label>
          <input class="uk-input" id="s-name" value="${original?.name ?? ""}" required pattern="\\w+"
            placeholder="e.g. degree_lifecycle"></div>
        <div class="sa-field sa-span"><label class="uk-form-label" for="s-desc">Description</label>
          <input class="uk-input" id="s-desc" value="${original?.description ?? ""}"
            placeholder="e.g. create a degree, read it, change it and delete it"></div>
      </div>
      <h2>Steps</h2>
      <ol id="s-steps"></ol>
      <div class="sa-block" id="s-step-box">
        <h3 id="s-step-title">New step</h3>
        <div class="sa-form">
          <div class="sa-field sa-span"><label class="uk-form-label" for="s-step-desc">What it does (optional)</label>
            <input class="uk-input" id="s-step-desc" placeholder="e.g. creates the degree"></div>
        </div>
        <div class="sa-form sa-form--wide" id="s-request"></div>
        <div class="sa-toolbar">
          <button class="uk-button uk-button-default" type="button" id="s-add">Add the step</button>
          <button class="uk-button uk-button-default" type="button" id="s-try">Try it</button>
          <button class="uk-button uk-button-default" type="button" id="s-cancel-step" hidden>Cancel the change</button>
        </div>
        <div id="s-step-result" role="status"></div>
      </div>
      <div class="sa-toolbar">
        <button class="uk-button uk-button-primary" type="submit">Save the scenario</button>
        <a class="uk-button uk-button-default" href="#/scenarios">Cancel</a>
      </div>
    </form>`;

  const form = main.querySelector("#scenario-form");
  const stepDesc = form.querySelector("#s-step-desc");
  let editingStep = null;  // The index of the step being changed in the box (null: a new one)
  const request = requestForm(form.querySelector("#s-request"), { context, id: "s" });
  const steps = orderedList(form.querySelector("#s-steps"), {
    items: original?.steps ?? [],
    empty: "No steps yet: write the first request below and add it.",
    render: stepLine,
    onEdit: (i) => edit(i),
  });

  function edit(i) {
    editingStep = i;
    const step = steps.items()[i];
    const unit = stepUnit(step);
    request.set(unit ? { request: unit.request, expect: unit.expect, definition: step } : null);
    stepDesc.value = step.description ?? "";
    form.querySelector("#s-step-title").textContent = `Step ${i + 1}`;
    form.querySelector("#s-add").textContent = "Update the step";
    form.querySelector("#s-cancel-step").hidden = false;
    form.querySelector("#s-step-box").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function clearBox() {
    editingStep = null;
    request.set(null);
    stepDesc.value = "";
    form.querySelector("#s-step-title").textContent = "New step";
    form.querySelector("#s-add").textContent = "Add the step";
    form.querySelector("#s-cancel-step").hidden = true;
    form.querySelector("#s-step-result").innerHTML = "";
  }
  const boxStep = () => request.definition({ description: stepDesc.value.trim() });
  const boxValid = () => [...form.querySelectorAll("#s-request [required]")].every((f) => f.reportValidity());

  form.querySelector("#s-add").addEventListener("click", () => {
    if (!boxValid()) return;
    if (editingStep === null) steps.add(boxStep());
    else steps.replace(editingStep, boxStep());
    clearBox();
  });
  form.querySelector("#s-cancel-step").addEventListener("click", clearBox);
  form.querySelector("#s-try").addEventListener("click", async () => {
    if (!boxValid()) return;
    const step = await runUnit(stepDesc.value || "Step", stepUnit(boxStep()), { source: "Try step" });
    form.querySelector("#s-step-result").innerHTML = html`${stepsDetail([step])}`;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const scenario = { name: form.querySelector("#s-name").value.trim(), steps: steps.items() };
    const description = form.querySelector("#s-desc").value.trim();
    if (description) scenario.description = description;
    if (!scenario.steps.length) return toast("Add at least one step", "error");
    const others = data.scenarios.filter((s) => s.name !== original?.name);
    if (others.some((s) => s.name === scenario.name)) return toast(`There is already a scenario named ${scenario.name}`, "error");
    others.splice(original ? data.scenarios.indexOf(original) : others.length, 0, scenario);
    if (await saveScenarios(others, data.etag)) {
      toast("Saved in admin/data/scenarios.json", "success");
      location.hash = "#/scenarios";
    }
  });
  if (!steps.items().length) form.querySelector("#s-step-desc").focus();
}
