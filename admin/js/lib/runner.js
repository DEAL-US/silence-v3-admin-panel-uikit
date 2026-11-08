// Runs the tests against the student's API (Silence does not run them): a unit test, opening the
// session of its "as" without password, and a scenario, step by step. They change the database.
import { link } from "./html.js";
import { quietApi } from "./api.js";
import { callApi } from "./student-api.js";
import { check } from "./testing.js";

const hasUser = (req) => req.as !== null && req.as !== undefined;

/** Runs a unit test and returns its result (a step): {index, test, method, path, status,
 *  response, failures, passed}. tokens: the sessions already opened in this run, by user;
 *  token: the session to use when the test has no "as" (a previous login, in a scenario). */
export async function runUnit(name, unit, { source, tokens = new Map(), token = null, index = 0, href } = {}) {
  const req = unit.request;
  let stepToken = token;
  if (hasUser(req)) {
    if (!tokens.has(String(req.as))) {
      try {
        tokens.set(String(req.as), (await quietApi(`/users/${encodeURIComponent(req.as)}/session`, "POST")).sessionToken);
      } catch (error) {
        return { index, test: name, method: req.method, path: req.path, passed: false,
          failures: [`Cannot open a session as user ${req.as}: ${error.message}`] };
      }
    }
    stepToken = tokens.get(String(req.as));
  }
  const res = await callApi(req.method, req.path, req.body, {
    source: hasUser(req) ? `${source} (as ${req.as})` : source,
    token: stepToken,
    href: href ?? (unit.source === "custom" ? link("tests", "edit", unit.file, unit.name) : "#/endpoints"),
    expect: (status, data) => check(unit.expect, status, data).length === 0,
  });
  const failures = check(unit.expect, res.status, res.data);
  return { index, test: name, method: req.method, path: req.path, status: res.status, response: res.data,
    failures, passed: failures.length === 0 };
}

/** Runs a scenario: its steps (requests, as unit tests define them), in order. A step that logs
 *  in (its response has a sessionToken) gives its session to the next steps without "as". It
 *  stops at the first failure. units: the steps as unit tests (null: a step that is not valid) */
export async function runScenario(scenario, units) {
  const tokens = new Map();
  let token = null;
  const steps = [];
  for (const [index, unit] of units.entries()) {
    const name = scenario.steps[index].description || `Step ${index + 1}`;
    if (!unit) {
      steps.push({ index, test: name, method: "", path: "", passed: false,
        failures: [scenario.steps[index].missing ? `There is no unit test ${scenario.steps[index].missing}` : "This step is not valid"] });
      break;
    }
    const step = await runUnit(name, unit, { source: `Scenario ${scenario.name}`, tokens, token, index,
      href: link("scenarios", "edit", scenario.name) });
    if (typeof step.response?.sessionToken === "string") token = step.response.sessionToken;
    steps.push(step);
    if (!step.passed) break;
  }
  return { passed: steps.length === units.length && steps.every((s) => s.passed), steps };
}
