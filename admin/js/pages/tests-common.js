// What the pages of the unit tests and scenarios share: loading them, their tabs, the results of
// the last runs (while the panel is open) and how a result is shown.
import { html, tabs, methodBadge, statusClass, json } from "../lib/html.js";
import { api, quietApi } from "../lib/api.js";
import { attempt } from "../lib/ui.js";

// The panel's data with the scenarios (admin/data/scenarios.json; before, composite_tests.json)
const SCENARIOS = "scenarios";
const OLD_SCENARIOS = "composite_tests";

/** The results of the last runs: "unit:<name>" or "scenario:<name>" → {passed, steps} */
export const results = new Map();

/** The unit tests (from Silence) and the scenarios (from the panel's data in admin/data/) */
export async function loadTests() {
  const [unitData, saved] = await Promise.all([attempt(() => api("/tests")), attempt(() => api(`/panel-data/${SCENARIOS}`))]);
  if (!unitData || !saved) return null;
  // The scenarios of an older panel, until they are saved again (then in scenarios.json)
  const old = saved.data === null ? await quietApi(`/panel-data/${OLD_SCENARIOS}`).catch(() => null) : null;
  const data = saved.data ?? old?.data;
  return {
    unitData,
    units: unitData.tests,
    scenarios: Array.isArray(data) ? data : [],
    scenariosEtag: saved.etag,
  };
}

export const saveScenarios = (list, etag) => attempt(() => api(`/panel-data/${SCENARIOS}`, "PUT", list, etag ?? ""));

export function testTabs(active, all) {
  return tabs([
    { key: "units", label: `Unit tests (${all.units.length})`, href: "#/tests" },
    { key: "scenarios", label: `Scenarios (${all.scenarios.length})`, href: "#/tests/scenarios" },
  ], active);
}

export function resultBadge(r) {
  if (!r) return html`<span class="uk-text-muted">—</span>`;
  return r.passed ? html`<span class="sa-pass">PASS</span>` : html`<span class="sa-fail">FAIL</span>`;
}

/** The steps of a result (a unit test has one): what was sent, what came back and why it failed */
export function stepsDetail(steps) {
  return html`${steps.map((s) => html`
    <div class="sa-step ${s.passed ? "sa-step--pass" : "sa-step--fail"} sa-small">
      ${steps.length > 1 ? html`Step ${s.index + 1} (<strong>${s.test}</strong>): ` : ""}
      ${s.method ? methodBadge(s.method) : ""} <span class="sa-route">${s.path}</span>
      ${s.status ? html`→ <span class="sa-status ${statusClass(s.status)}">${s.status}</span>` : ""}
      ${s.failures.length ? html`<br>${s.failures.map((f, i) => html`${i ? html`<br>` : ""}${f}`)}
        ${s.response !== undefined ? html`<details><summary>Response</summary><pre class="sa-pre">${json(s.response)}</pre></details>` : ""}` : ""}
    </div>`)}`;
}
