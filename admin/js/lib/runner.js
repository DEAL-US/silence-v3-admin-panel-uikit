// Runs the tests against the student's API (Silence does not run them), opening the session of
// their "as" without password. They change the database.
import { link } from "./html.js";
import { quietApi } from "./api.js";
import { callApi } from "./student-api.js";
import { check } from "./testing.js";

const hasUser = (req) => req.as !== null && req.as !== undefined;

/** Runs a test and returns its result (a step): {test, method, path, status, response,
 *  failures, passed}. tokens: the sessions already opened in this run, by user. */
export async function runUnit(name, unit, { source, tokens = new Map(), href } = {}) {
  const req = unit.request;
  let stepToken = null;
  if (hasUser(req)) {
    if (!tokens.has(String(req.as))) {
      try {
        tokens.set(String(req.as), (await quietApi(`/users/${encodeURIComponent(req.as)}/session`, "POST")).sessionToken);
      } catch (error) {
        return { test: name, method: req.method, path: req.path, passed: false,
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
  return { test: name, method: req.method, path: req.path, status: res.status, response: res.data,
    failures, passed: failures.length === 0 };
}
