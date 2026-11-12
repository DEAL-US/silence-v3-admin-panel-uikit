// The tests in the grid of the endpoints: each endpoint with its tests (the generated ones and the
// custom ones), a column with how many there are and how they went, its tests under its row when
// they are opened, and the tests that are not of an endpoint (e.g., login and logout) apart.
// A generated test that fails offers a custom test from it, which expects what the API answered.
import { html, link, iconButton, methodBadge, sourceBadge, muted } from "../lib/html.js";
import { api } from "../lib/api.js";
import { attempt, toast, needsConfirm } from "../lib/ui.js";
import { sortForRun, expectText, matchRoute } from "../lib/testing.js";
import { runUnit } from "../lib/runner.js";
import { deleteEntry, testsFile } from "../lib/files.js";
import { beginGroup, endGroup } from "../lib/log.js";
import { results, loadTests, resultBadge, stepsDetail } from "./tests-common.js";

const endpointKey = (e) => `${e.method} ${e.route}`;

/**
 * The tests of the endpoints of a grid. options: {app, scripts (database.scripts), redraw()}:
 * redraw draws the grid again (its cells and the opened rows). Returns the parts that the grid uses.
 */
export function endpointTests({ app, scripts, redraw }) {
  let all = { units: [], errors: [] };
  let byEndpoint = new Map();  // endpoint key → its tests
  let others = [];             // the tests that are not of an endpoint
  const opened = new Set();    // the endpoints whose tests are shown

  /** The tests of each endpoint: the one each test says, or the one whose route matches it */
  function group(endpoints) {
    byEndpoint = new Map(endpoints.map((e) => [endpointKey(e), []]));
    others = [];
    for (const t of all.units) {
      const e = byEndpoint.has(t.endpoint) ? t.endpoint : endpoints.map(endpointKey).find((k) => {
        const [method, route] = k.split(" ");
        return method === t.request.method && matchRoute(route, t.request.path.split("?")[0]);
      });
      if (e) byEndpoint.get(e).push(t);
      else others.push(t);
    }
  }

  async function load(endpoints) {
    const res = await loadTests();
    if (res) all = res;
    group(endpoints);
  }

  const testsOf = (e) => byEndpoint.get(endpointKey(e)) ?? [];
  const resultOf = (t) => results.get("unit:" + t.name);

  /** The cell of the grid: how many tests, and how they went the last time (it opens them) */
  function cell(e) {
    const tests = testsOf(e);
    if (!tests.length) return muted("—");
    const done = tests.filter(resultOf);
    const passed = done.filter((t) => resultOf(t).passed).length;
    const label = done.length ? `${passed}/${tests.length}` : `${tests.length}`;
    const cls = !done.length ? "" : passed === done.length ? "sa-pass" : "sa-fail";
    return html`<button class="uk-button uk-button-link sa-tests-toggle" type="button" data-action="toggle-tests"
      aria-expanded="${opened.has(endpointKey(e))}" title="${opened.has(endpointKey(e)) ? "Hide its tests" : "Show its tests"}">
      <span class="${cls}">${label}</span> <span uk-icon="icon: ${opened.has(endpointKey(e)) ? "chevron-up" : "chevron-down"}; ratio: .7"></span>
    </button>`;
  }

  /** The tests of an endpoint, under its row */
  function panel(e) {
    if (!opened.has(endpointKey(e))) return "";
    const tests = testsOf(e);
    return html`<div class="sa-tests-panel" data-endpoint="${endpointKey(e)}">
      <div class="sa-toolbar">
        <button class="uk-button uk-button-default uk-button-small" type="button" data-action="run-endpoint-tests"
          ${tests.length && !running ? "" : "disabled"}>Run its ${tests.length} tests</button>
        <a class="uk-button uk-button-default uk-button-small" href="${link("tests", "endpoint", e.file, e.name)}">New test for this endpoint</a>
      </div>
      ${tests.length ? rows(tests) : muted("No tests: write one for a rule of this endpoint.")}
    </div>`;
  }

  /** The rows of a list of tests (with the failures under them), each one with its name */
  function rows(tests) {
    return html`<table class="uk-table uk-table-small uk-table-divider sa-tests"><tbody>
      ${tests.map((t) => {
        const r = resultOf(t);
        const failed = r && !r.passed;
        return html`<tr data-test="${t.name}">
          <td class="sa-actions">
            ${iconButton("play", "Run it", { action: "run-test", disabled: running })}
            ${t.source === "custom"
              ? html`${iconButton("pencil", "Edit", { href: link("tests", "edit", t.file, t.name) })}
                ${iconButton("trash", "Delete", { action: "delete-test", danger: true })}`
              : failed ? "" : iconButton("copy", "Create a custom test from it", { href: link("tests", "new", t.name) })}
          </td>
          <td>${resultBadge(r)}</td>
          <td><strong>${t.name}</strong>${t.description ? html`<br><span class="uk-text-muted sa-small">${t.description}</span>` : ""}</td>
          <td class="sa-nowrap">${methodBadge(t.request.method)} <span class="sa-route">${t.request.path}</span></td>
          <td class="sa-nowrap">${t.request.as === null || t.request.as === undefined ? muted("no session") : html`as ${t.request.as}`}</td>
          <td class="sa-nowrap">→ ${expectText(t.expect)}</td>
          <td>${sourceBadge(t.source)}</td>
        </tr>
        ${failed ? html`<tr data-test="${t.name}" class="sa-tests__failure"><td></td><td colspan="6">${stepsDetail(r.steps)}
          ${t.source === "auto" ? html`<a class="uk-button uk-button-default uk-button-small" href="${link("tests", "new", t.name)}">Create
            a custom test from it</a> <span class="uk-text-muted sa-small">A generated test can fail because of a rule of yours
            (a CHECK, a trigger): then write the test of that rule.</span>` : ""}</td></tr>` : ""}`;
      })}
    </tbody></table>`;
  }

  /** The tests that are not of an endpoint (e.g., login and logout, Silence's) */
  function othersSection() {
    return others.length ? html`<h2>Other tests</h2>
      <p class="uk-text-muted sa-small">Tests of requests that are not of one of your endpoints (e.g., Silence's login and
        logout).</p>${rows(others)}` : "";
  }

  /** The summary of the results, or the progress while the tests run */
  function summary() {
    if (running) return progressView();
    const done = all.units.filter(resultOf);
    const passed = done.filter((t) => resultOf(t).passed).length;
    return done.length ? html`<span class="${passed === done.length ? "sa-pass" : "sa-fail"}">${passed} / ${done.length} tests passed</span>` : "";
  }

  // While the tests run (they may take a while: the database is created again first), the summary
  // says what is being done and how many have run ({text, done, total}), and the buttons that run
  // tests wait. Both are part of what is drawn, so a redraw meanwhile keeps them
  let running = null;
  const RUN_BUTTONS = "#run-all, [data-action='run-endpoint-tests'], [data-action='run-test']";
  function progressView() {
    const { text, done, total } = running;
    return html`<span class="sa-progress"><span uk-spinner="ratio: .6"></span> <span class="sa-progress__text">${text}</span>
      <progress class="uk-progress sa-progress__bar" value="${done ?? 0}" max="${total ?? 1}" ${total ? "" : "hidden"}></progress></span>`;
  }
  /** Updates the progress: only its text and bar if it is drawn, so that the spinner keeps turning */
  function progress(text, done = null, total = null) {
    running = { text, done, total };
    const box = document.querySelector("#tests-summary");
    if (!box) return;
    const shown = box.querySelector(".sa-progress");
    if (!shown) {
      box.innerHTML = progressView();
      return;
    }
    shown.querySelector(".sa-progress__text").textContent = text;
    const bar = shown.querySelector(".sa-progress__bar");
    bar.hidden = !total;
    if (total) Object.assign(bar, { value: done, max: total });
  }
  /** The buttons that are already drawn (#run-all, in the toolbar, is not drawn again) */
  function disableRunButtons(on) {
    document.querySelectorAll(RUN_BUTTONS).forEach((b) => {
      b.disabled = on;
    });
  }

  /** Runs some tests (GET, POST, PUT, DELETE), creating the database again first if asked */
  async function run(tests, { reload = false } = {}) {
    if (running) return toast("The tests are already running", "info");
    progress("Starting…");
    disableRunButtons(true);
    try {
      if (reload) {
        progress("Creating the database again…");
        if (!await attempt(() => api("/database/reload", "POST"))) return;
        // The generated tests take rows of the data (e.g., one that can be deleted): written again
        // by Silence from the original data
        const fresh = await loadTests();
        if (fresh) {
          all = fresh;
          tests = tests.map((t) => fresh.units.find((u) => u.name === t.name) ?? t);
        }
      }
      const tokens = new Map();
      let passed = 0;
      const ordered = sortForRun(tests);
      // More than one: their requests together in the activity, with the result
      const many = ordered.length > 1;
      if (many) beginGroup("Tests", `Run ${ordered.length} tests`, "#/endpoints");
      for (const [i, t] of ordered.entries()) {
        progress(`Running the tests: ${i + 1} of ${ordered.length} (${passed} passed)`, i, ordered.length);
        const step = await runUnit(t.name, t, { source: `Test ${t.name}`, tokens });
        results.set("unit:" + t.name, { passed: step.passed, steps: [step] });
        if (step.passed) passed++;
      }
      if (many) endGroup(`${passed} of ${ordered.length} passed`, passed === ordered.length);
      toast(`${passed} of ${ordered.length} tests passed`, passed === ordered.length ? "success" : "warning");
    } finally {
      running = null;
      disableRunButtons(false);
      redraw();
    }
  }

  /** Runs a group of tests after a confirmation: from the original data, if there are scripts */
  function runGroup(tests, button) {
    if (!tests.length) return toast("There are no tests to run", "info");
    const question = scripts.length ? `Create the database again and run ${tests.length}?` : `Run ${tests.length}? They change the database`;
    if ((scripts.length || tests.some((t) => t.request.method !== "GET")) && !needsConfirm(button, question)) return;
    run(tests, { reload: scripts.length > 0 });
  }

  /** The actions of the tests (in the grid or in the other tests). Returns true if it was one. */
  async function handle(action, endpoint, element, endpoints) {
    const name = element.closest("[data-test]")?.dataset.test;
    const test = all.units.find((t) => t.name === name);
    if (action === "toggle-tests") {
      const k = endpointKey(endpoint);
      if (opened.has(k)) opened.delete(k);
      else opened.add(k);
      redraw();
      return true;
    }
    if (action === "run-endpoint-tests") {
      runGroup(testsOf(endpoint), element);
      return true;
    }
    if (action === "run-test" && test) {
      if (test.request.method === "GET" || needsConfirm(element, "Run? It changes the database")) run([test]);
      return true;
    }
    if (action === "delete-test" && test) {
      if (!needsConfirm(element, "Delete?")) return true;
      if (await attempt(() => deleteEntry(testsFile(test.file), test.name), "Deleted")) {
        results.delete("unit:" + test.name);
        await load(endpoints);
        redraw();
      }
      return true;
    }
    return false;
  }

  return {
    load, cell, panel, othersSection, summary, handle,
    count: (e) => testsOf(e).length,
    errors: () => all.errors,
    runAll: (button) => runGroup(all.units, button),
  };
}
