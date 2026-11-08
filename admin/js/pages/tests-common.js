// What the pages share about the tests: loading them, the results of the last runs (while the
// panel is open) and how a result is shown.
import { html, methodBadge, statusClass, json } from "../lib/html.js";
import { quietApi } from "../lib/api.js";
import { attempt } from "../lib/ui.js";
import { parseUnit } from "../lib/testing.js";
import { quietReadFile, listFiles } from "../lib/files.js";

/** The results of the last runs: "unit:<name>" → {passed, steps} (a test has one step) */
export const results = new Map();

/** A custom test as the panel shows it (the same fields as a generated one) */
function customTest(file, name, definition) {
  const { request, expect } = parseUnit(definition);
  return { name, file, table: file, source: "custom", description: definition.description ?? "",
    endpoint: definition.endpoint ?? "", definition, request, expect };
}

/** The unit tests: the generated ones (Silence computes them from the endpoints and the data) and
 *  the custom ones (the files tests/*.json). errors: what is wrong in those files */
export async function loadTests() {
  return attempt(async () => {
    const status = await quietApi("/status");
    const generated = status.database.error ? [] : (await quietApi("/tests/generated")).tests;
    const custom = [];
    const errors = [...status.errors.tests];
    for (const { path } of await listFiles("tests")) {
      const file = path.slice("tests/".length).replace(/\.json$/, "");
      const { data } = await quietReadFile(path);
      for (const [name, definition] of Object.entries(data ?? {})) {
        try {
          custom.push(customTest(file, name, definition));
        } catch (err) {
          if (!errors.some((e) => e.includes(name))) errors.push(`'${name}' in ${file}.json: ${err.message}`);
        }
      }
    }
    const names = new Set(generated.map((t) => t.name));
    return { units: [...generated, ...custom.filter((t) => !names.has(t.name))], errors };
  });
}

export function resultBadge(r) {
  if (!r) return html`<span class="uk-text-muted">—</span>`;
  return r.passed ? html`<span class="sa-pass">PASS</span>` : html`<span class="sa-fail">FAIL</span>`;
}

/** The steps of a result (a test has one): what was sent, what came back and why it failed */
export function stepsDetail(steps) {
  return html`${steps.map((s) => html`
    <div class="sa-step ${s.passed ? "sa-step--pass" : "sa-step--fail"} sa-small">
      ${s.method ? methodBadge(s.method) : ""} <span class="sa-route">${s.path}</span>
      ${s.status ? html`→ <span class="sa-status ${statusClass(s.status)}">${s.status}</span>` : ""}
      ${s.failures.length ? html`<br>${s.failures.map((f, i) => html`${i ? html`<br>` : ""}${f}`)}
        ${s.response !== undefined ? html`<details><summary>Response</summary><pre class="sa-pre">${json(s.response)}</pre></details>` : ""}` : ""}
    </div>`)}`;
}
