// What the pages of the unit and composite tests share: loading them, their tabs, the results of
// the last runs (while the panel is open) and how a result is shown.
import { html, tabs, methodBadge, statusClass, json } from "../lib/html.js";
import { api } from "../lib/api.js";
import { attempt } from "../lib/ui.js";

const COMPOSITE_DATA = "composite_tests";

/** The results of the last runs: "unit:<name>" or "composite:<name>" → {passed, steps} */
export const results = new Map();

/** The unit tests (from Silence) and the composite ones (from the panel's data in admin/data/) */
export async function loadTests() {
  const [unitData, composite] = await Promise.all([attempt(() => api("/tests")), attempt(() => api(`/panel-data/${COMPOSITE_DATA}`))]);
  if (!unitData || !composite) return null;
  return {
    unitData,
    units: unitData.tests,
    composites: Array.isArray(composite.data) ? composite.data : [],
    compositeEtag: composite.etag,
  };
}

export const saveComposites = (list, etag) => attempt(() => api(`/panel-data/${COMPOSITE_DATA}`, "PUT", list, etag ?? ""));

export function testTabs(active, all) {
  return tabs([
    { key: "units", label: `Unit tests (${all.units.length})`, href: "#/tests" },
    { key: "composite", label: `Composite (${all.composites.length})`, href: "#/tests/composite" },
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
