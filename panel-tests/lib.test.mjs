// Tests of the modules of the panel without DOM: node --test panel-tests/
import { test } from "node:test";
import assert from "node:assert/strict";

import { html, raw, esc, tabs, options } from "../admin/js/lib/html.js";
import { check, parseUnit, sortForRun, expectText } from "../admin/js/lib/testing.js";
import { describe as describeAction, whereIs } from "../admin/js/lib/activity.js";
import { formValues, changes } from "../admin/js/lib/forms.js";

test("html escapes what it interpolates, but not other html", () => {
  const name = `<img src=x onerror="alert(1)">`;
  assert.equal(String(html`<b>${name}</b>`), "<b>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</b>");
  assert.equal(String(html`<p>${html`<i>${"a&b"}</i>`}</p>`), "<p><i>a&amp;b</i></p>");
  assert.equal(String(html`<p>${raw("<br>")}</p>`), "<p><br></p>");
  assert.equal(String(html`${["<a>", html`<b></b>`]}`), "&lt;a&gt;<b></b>");
  assert.equal(String(html`${null}${undefined}${false}${0}`), "0");
  assert.equal(esc(`'"`), "&#39;&quot;");
});

test("tabs and options", () => {
  const t = String(tabs([{ key: "a", label: "A", href: "#/a" }, { key: "b", label: "B<", href: "#/b", disabled: "Not yet" }], "a"));
  assert.match(t, /role="tablist"/);
  assert.match(t, /class="uk-active"><a role="tab" aria-selected="true"/);
  assert.match(t, /class="uk-disabled" title="Not yet"/);
  assert.match(t, /B&lt;/);
  const o = String(options([["1", "One"], "two"], "two", "—"));
  assert.match(o, /<option value="">—<\/option>/);
  assert.match(o, /<option value="two" selected>two<\/option>/);
});

test("check: the status (2xx by default) and a part of the message", () => {
  assert.deepEqual(check({}, 200, []), []);
  assert.equal(check({}, 404, {}).length, 1);
  assert.deepEqual(check({ status: 404 }, 404, {}), []);
  assert.match(check({ status: 403 }, 200, {})[0], /expected status 403, got 200/);
  assert.deepEqual(check({ status: 400, message: "validSalary" }, 400, { message: "CHECK validSalary failed" }), []);
  assert.equal(check({ message: "x" }, 200, [1]).length, 1);
});

test("parseUnit: short and long forms, and what is not a unit test", () => {
  assert.deepEqual(parseUnit({ "GET /employees/1": null, as: 2, expect: 200 }),
    { request: { method: "GET", path: "/employees/1", body: null, as: 2 }, expect: { status: 200 } });
  assert.deepEqual(parseUnit({ request: { method: "put", path: "/x", body: { a: 1 } }, expect: { status: 403 } }),
    { request: { method: "PUT", path: "/x", body: { a: 1 }, as: null }, expect: { status: 403 } });
  assert.throws(() => parseUnit({ steps: [] }), /scenarios/);
  assert.throws(() => parseUnit({ "GET /a": null, "POST /b": {} }), /one request/);
  assert.throws(() => parseUnit([]), /object/);
  assert.equal(expectText({}), "2xx");
});

test("sortForRun: GET, POST, PUT, DELETE (stable)", () => {
  const t = (method, n) => ({ n, request: { method } });
  const order = sortForRun([t("DELETE", 1), t("GET", 2), t("PUT", 3), t("POST", 4), t("GET", 5)]).map((x) => x.n);
  assert.deepEqual(order, [2, 5, 4, 3, 1]);
});

test("the console's texts and links of the actions", () => {
  assert.deepEqual(describeAction("PUT", "/endpoints/employees/update", {}, {}), ["Endpoints", "employees/update saved"]);
  assert.deepEqual(describeAction("PATCH", "/config/auth", { login: false, password_mode: "plain" }),
    ["Users", "Saved in silence.json: login off, passwords as plain text"]);
  assert.equal(describeAction("PATCH", "/config/auth", { table: "" })[1], "Users table unlinked");
  assert.equal(describeAction("POST", "/database/test", { user: "u", host: "h", port: 1, name: "d" }, { ok: true, databases: ["d"] })[1],
    "Connection tested: u@h:1/d, connected (1 databases)");
  assert.equal(describeAction("PATCH", "/config/database", { scripts: ["a.sql"] })[1], "Scripts saved in silence.json: a.sql");
  assert.equal(whereIs("/config/auth"), "#/overview/login");
  assert.equal(whereIs("/tests/employees/x"), "#/endpoints");
  assert.equal(whereIs("/panel-data/scenarios"), "#/scenarios");
});

test("formValues: types, radios, disabled controls and sections", () => {
  const el = (props) => ({ disabled: false, dataset: {}, type: "text", ...props });
  const form = { querySelectorAll: () => [
    el({ name: "host", value: "127.0.0.1", dataset: { section: "database" } }),
    el({ name: "port", type: "number", value: "3306", dataset: { section: "database" } }),
    el({ name: "login", type: "checkbox", checked: true, dataset: { section: "auth" } }),
    el({ name: "mode", type: "radio", value: "argon2", checked: false, dataset: { section: "auth" } }),
    el({ name: "mode", type: "radio", value: "plain", checked: true, dataset: { section: "auth" } }),
    el({ name: "roles", value: "A, B,", dataset: { type: "list" } }),
    el({ name: "off", value: "x", disabled: true }),
  ] };
  assert.deepEqual(formValues(form), { host: "127.0.0.1", port: 3306, login: true, mode: "plain", roles: ["A", "B"] });
  assert.deepEqual(formValues(form, { bySection: true }),
    { database: { host: "127.0.0.1", port: 3306 }, auth: { login: true, mode: "plain" } });
  assert.deepEqual(changes({ auth: { login: true, mode: "argon2" } }, { auth: { login: true, mode: "plain" } }),
    { auth: { mode: "plain" } });
});

test("the unit test editor: routes, typed values and the saved definition", async () => {
  const { routeParams, matchRoute, fillRoute, parseValue, valueText, buildDefinition } = await import("../admin/js/lib/testing.js");
  assert.deepEqual(routeParams("/employees/$employeeId/salary"), ["employeeId"]);
  assert.deepEqual(matchRoute("/employees/$employeeId/salary", "/employees/4/salary"), { employeeId: "4" });
  assert.equal(matchRoute("/a/$x", "/b/1"), null);
  assert.equal(fillRoute("/e/$id", { id: "a b" }), "/e/a%20b");
  assert.deepEqual(["", "null", "true", "12", "-1.5", "x"].map(parseValue), [undefined, null, true, 12, -1.5, "x"]);
  assert.deepEqual([null, 3, "a", undefined].map(valueText), ["null", "3", "a", ""]);
  assert.deepEqual(buildDefinition({ description: "d", endpoint: "PUT /e/$id/salary", method: "PUT", path: "/e/4/salary",
    body: { salary: -5, other: undefined }, as: "2", expect: { status: 400, message: "validSalary" } }),
  { description: "d", endpoint: "PUT /e/$id/salary", "PUT /e/4/salary": { salary: -5 }, as: 2,
    expect: { status: 400, message: "validSalary" } });
  assert.deepEqual(buildDefinition({ method: "GET", path: "/e", body: null, as: "", expect: { status: 200 } }),
    { "GET /e": null, expect: 200 });
  assert.deepEqual(buildDefinition({ method: "DELETE", path: "/e/1", body: null, expect: {} }), { "DELETE /e/1": null });
});

test("the query string of the tests", async () => {
  const { queryOf, withQuery } = await import("../admin/js/lib/testing.js");
  assert.deepEqual(queryOf("/students/above?minAverage=7&x=a%20b"), { minAverage: "7", x: "a b" });
  assert.deepEqual(queryOf("/students"), {});
  assert.equal(withQuery("/students/above", { minAverage: "7", empty: "" }), "/students/above?minAverage=7");
  assert.equal(withQuery("/students", {}), "/students");
});
