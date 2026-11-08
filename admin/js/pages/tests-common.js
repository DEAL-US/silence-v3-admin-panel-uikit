// What the pages share about the tests and the scenarios: loading them, the results of the last
// runs (while the panel is open) and how a result is shown.
import { html, methodBadge, statusClass, json } from "../lib/html.js";
import { api, quietApi } from "../lib/api.js";
import { attempt } from "../lib/ui.js";
import { parseUnit } from "../lib/testing.js";

// The panel's data with the scenarios (admin/data/scenarios.json; before, composite_tests.json)
const SCENARIOS = "scenarios";
const OLD_SCENARIOS = "composite_tests";

/** The results of the last runs: "unit:<name>" or "scenario:<name>" → {passed, steps} */
export const results = new Map();

/** The unit tests (the generated ones and the custom ones), as Silence gives them */
export async function loadTests() {
  const unitData = await attempt(() => api("/tests"));
  return unitData ? { unitData, units: unitData.tests } : null;
}

/** A scenario of an older panel: its steps were the names of unit tests (now, the requests) */
function upgrade(scenario, units) {
  return {
    ...scenario,
    steps: scenario.steps.map((step) => {
      if (typeof step !== "string") return step;
      const unit = units.find((u) => u.name === step);
      return unit ? { ...unit.definition, description: unit.description || step } : { missing: step };
    }),
  };
}

/** The scenarios (the panel's data in admin/data/), each step a request as a unit test defines it */
export async function loadScenarios(units) {
  const saved = await attempt(() => api(`/panel-data/${SCENARIOS}`));
  if (!saved) return null;
  const old = saved.data === null ? await quietApi(`/panel-data/${OLD_SCENARIOS}`).catch(() => null) : null;
  const data = saved.data ?? old?.data;
  return { scenarios: (Array.isArray(data) ? data : []).map((s) => upgrade(s, units ?? [])), etag: saved.etag };
}

export const saveScenarios = (list, etag) => attempt(() => api(`/panel-data/${SCENARIOS}`, "PUT", list, etag ?? ""));

/** A step of a scenario as a unit test (null if it is not valid) */
export function stepUnit(step) {
  if (step.missing) return null;
  try {
    return parseUnit(step);
  } catch {
    return null;
  }
}

export function resultBadge(r) {
  if (!r) return html`<span class="uk-text-muted">—</span>`;
  return r.passed ? html`<span class="sa-pass">PASS</span>` : html`<span class="sa-fail">FAIL</span>`;
}

/** The steps of a result (a unit test has one): what was sent, what came back and why it failed */
export function stepsDetail(steps) {
  return html`${steps.map((s) => html`
    <div class="sa-step ${s.passed ? "sa-step--pass" : "sa-step--fail"} sa-small">
      ${steps.length > 1 ? html`Step ${s.index + 1}${s.test ? html` (<strong>${s.test}</strong>)` : ""}: ` : ""}
      ${s.method ? methodBadge(s.method) : ""} <span class="sa-route">${s.path}</span>
      ${s.status ? html`→ <span class="sa-status ${statusClass(s.status)}">${s.status}</span>` : ""}
      ${s.failures.length ? html`<br>${s.failures.map((f, i) => html`${i ? html`<br>` : ""}${f}`)}
        ${s.response !== undefined ? html`<details><summary>Response</summary><pre class="sa-pre">${json(s.response)}</pre></details>` : ""}` : ""}
    </div>`)}`;
}
