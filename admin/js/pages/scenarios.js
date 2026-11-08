// Scenarios: sequences of unit tests, by name, kept by the panel (admin/data/scenarios.json)
// and run step by step against the student's API (they change the database). Views (after
// #/tests/scenarios): the grid, /new and /edit/<name>.
import { html, link, iconButton, options } from "../lib/html.js";
import { toast, needsConfirm } from "../lib/ui.js";
import { runScenario } from "../lib/runner.js";
import { dataTable } from "../components/table.js";
import { orderedList } from "../components/ordered-list.js";
import { results, loadTests, saveScenarios, testTabs, resultBadge, stepsDetail } from "./tests-common.js";

export function crumbs(params) {
  const [view, name] = params;
  const base = [{ label: "Tests", href: "#/tests" }, { label: "Scenarios", href: "#/tests/scenarios" }];
  if (view === "edit") return [...base, { label: name }];
  if (view === "new") return [...base, { label: "New scenario" }];
  return [base[0], { label: "Scenarios" }];
}

export function parent(params) {
  return params[0] === "edit" || params[0] === "new" ? "#/tests/scenarios" : null;
}

export function render(main, app, params) {
  const [view, name] = params;
  if (view === "edit") return editor(main, name);
  if (view === "new") return editor(main, null);
  return list(main);
}

const unitName = (s, exists) => html`<code class="sa-unit ${exists ? "" : "sa-unit--missing"}"
  title="${exists ? "" : "There is no unit test with this name"}">${s}</code>`;

async function list(main) {
  const all = await loadTests();
  if (!all) return;
  const names = new Set(all.units.map((u) => u.name));
  const resultOf = (c) => results.get("scenario:" + c.name);

  main.innerHTML = html`
    <h1>Tests</h1>
    <p class="uk-text-muted">Scenarios: unit tests run one after another by this panel, against your API (e.g., create, read, change and delete a row).
      <strong>They change the database</strong>. A step that logs in gives its session to the next steps. The panel
      saves them in <code>admin/data/scenarios.json</code>.</p>
    ${testTabs("scenarios", all)}
    <div class="sa-toolbar">
      <a class="uk-button uk-button-primary" href="#/tests/scenarios/new">New scenario</a>
    </div>
    <div id="grid"></div>`;

  const table = dataTable(main.querySelector("#grid"), {
    rows: all.scenarios, sort: { key: "name", dir: "asc" },
    empty: all.units.length
      ? html`No scenarios yet: <a href="#/tests/scenarios/new">create one</a> with the unit tests in the order to run them.`
      : html`No scenarios yet: they are made of unit tests, and there are none (they come from the endpoints:
          <a href="#/endpoints">generate them first</a>).`,
    columns: [
      { key: "actions", label: "", filter: false, sortable: false, className: "sa-actions", render: (c) => html`
        ${iconButton("play", "Run (changes the database)", { action: "run" })}
        ${iconButton("pencil", "Edit", { href: link("tests", "scenarios", "edit", c.name) })}
        ${iconButton("trash", "Delete", { action: "delete", danger: true })}` },
      { key: "result", label: "Result", filter: "select",
        value: (c) => (resultOf(c) ? (resultOf(c).passed ? "PASS" : "FAIL") : ""), render: (c) => resultBadge(resultOf(c)) },
      { key: "name", label: "Test", render: (c) => html`<strong>${c.name}</strong>` },
      { key: "steps", label: "Steps", filter: false, value: (c) => c.steps.length },
      { key: "units", label: "Unit tests", value: (c) => c.steps.join(" "),
        render: (c) => html`${c.steps.map((s, i) => html`${i ? " → " : ""}${unitName(s, names.has(s))}`)}` },
    ],
    after: (c) => (resultOf(c) && !resultOf(c).passed ? stepsDetail(resultOf(c).steps) : ""),
    onAction: async (action, c, button) => {
      if (action === "run" && needsConfirm(button, "Run? It changes the database")) {
        const r = await runScenario(c, all.units);
        results.set("scenario:" + c.name, r);
        toast(`${c.name}: ${r.passed ? "passed" : "failed"} (${r.steps.filter((s) => s.passed).length} of ${c.steps.length} steps)`,
          r.passed ? "success" : "warning");
        table.update(all.scenarios);
      }
      if (action === "delete" && needsConfirm(button, "Delete?")) {
        if (await saveScenarios(all.scenarios.filter((x) => x.name !== c.name), all.scenariosEtag)) {
          results.delete("scenario:" + c.name);
          toast("Deleted", "success");
          list(main);
        }
      }
    },
  });
}

async function editor(main, name) {
  const all = await loadTests();
  if (!all) return;
  const original = name ? all.scenarios.find((c) => c.name === name) : null;
  if (name && !original) {
    main.innerHTML = html`<div class="uk-alert uk-alert-danger">There is no scenario ${name}.</div>`;
    return;
  }
  const unitNames = all.units.map((u) => u.name).sort();

  main.innerHTML = html`
    <h1>${original ? `Edit ${original.name}` : "New scenario"}</h1>
    <form id="scenario-form">
      <div class="sa-form">
        <div class="sa-field"><label class="uk-form-label" for="c-name">Name</label>
          <input class="uk-input" id="c-name" name="name" value="${original?.name ?? ""}" required pattern="\\w+"></div>
        <div class="sa-field"><label class="uk-form-label" for="c-desc">Description</label>
          <input class="uk-input" id="c-desc" name="description" value="${original?.description ?? ""}"></div>
      </div>
      <h2>Steps</h2>
      <ol id="c-steps"></ol>
      <div class="sa-toolbar">
        <select class="uk-select sa-step-select" id="c-add-name" aria-label="Unit test to add">${options(unitNames)}</select>
        <button class="uk-button uk-button-default" type="button" id="c-add">Add step</button>
      </div>
      <div class="sa-toolbar">
        <button class="uk-button uk-button-primary" type="submit">Save</button>
        <a class="uk-button uk-button-default" href="#/tests/scenarios">Cancel</a>
      </div>
    </form>`;

  const steps = orderedList(main.querySelector("#c-steps"), {
    items: original?.steps ?? [],
    empty: "No steps yet: add unit tests below.",
    render: (s) => html`${unitName(s, unitNames.includes(s))}
      ${unitNames.includes(s) ? "" : html`<span class="uk-text-danger sa-small">(it does not exist)</span>`}`,
  });
  main.querySelector("#c-add").addEventListener("click", () => steps.add(main.querySelector("#c-add-name").value));
  const form = main.querySelector("#scenario-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const { name: newName, description } = Object.fromEntries(new FormData(form));
    const test = { name: newName.trim(), steps: steps.items() };
    if (description.trim()) test.description = description.trim();
    if (!test.steps.length) return toast("Add at least one step", "error");
    const others = all.scenarios.filter((c) => c.name !== original?.name);
    if (others.some((c) => c.name === test.name)) return toast(`There is already a scenario named ${test.name}`, "error");
    others.splice(original ? all.scenarios.indexOf(original) : others.length, 0, test);
    if (await saveScenarios(others, all.scenariosEtag)) {
      toast("Saved in admin/data/scenarios.json", "success");
      location.hash = "#/tests/scenarios";
    }
  });
}
