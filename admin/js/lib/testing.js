// The unit tests as the panel understands them: their definition (short or long form), how a
// response is checked against what they expect (the same rules as Silence's CI, see
// tests/run_units.py in silence-py) and the order in which they run. Without DOM: it can be tested.

/** The order in which the unit tests run: the reads see the data before the changes */
export const ORDER = { GET: 0, POST: 1, PUT: 2, DELETE: 3 };

export const sortForRun = (tests) => [...tests].sort((a, b) =>
  (ORDER[a.request.method] ?? 9) - (ORDER[b.request.method] ?? 9));

/** The failures of a response against what a unit test expects ([] if it passes): status (by
 *  default, any 2xx) and message (a part of the error message) */
export function check(expect, status, data) {
  const failures = [];
  if (expect.status !== undefined) {
    if (expect.status !== status) failures.push(`expected status ${expect.status}, got ${status}`);
  } else if (!(status >= 200 && status < 300)) {
    failures.push(`expected a 2xx status, got ${status}`);
  }
  if (expect.message !== undefined) {
    const msg = data && typeof data === "object" && !Array.isArray(data) ? data.message ?? "" : "";
    if (!msg.includes(expect.message)) {
      failures.push(`expected a message with ${JSON.stringify(expect.message)}, got ${JSON.stringify(msg)}`);
    }
  }
  return failures;
}

/** The request and the expectation of a unit test as written in its file: the short form
 *  ({"METHOD /path": body, "as": id, "expect": status | {...}}) or the long one ({request, expect}).
 *  Error (with a message for the student) if it is not a unit test. */
export function parseUnit(def) {
  if (!def || typeof def !== "object" || Array.isArray(def)) throw new Error("A test is an object");
  if (def.steps) throw new Error("A unit test has one request: the scenarios go in the Scenarios tab");
  let request;
  if (def.request) {
    request = { method: String(def.request.method ?? "GET").toUpperCase(), path: def.request.path,
      body: def.request.body ?? null, as: def.request.as ?? null };
  } else {
    const keys = Object.keys(def).filter((k) => /^(GET|POST|PUT|DELETE)\s+\//i.test(k));
    if (keys.length !== 1) throw new Error('Write one request as "METHOD /path": body (e.g. "GET /employees/1": null)');
    const [m, path] = keys[0].trim().split(/\s+/);
    request = { method: m.toUpperCase(), path, body: def[keys[0]], as: def.as ?? null };
  }
  if (!request.path) throw new Error("The request has no path");
  let expect = def.expect ?? {};
  if (typeof expect === "number") expect = { status: expect };
  return { request, expect };
}

/** What a test expects, in short (for the grids) */
export const expectText = (expect) => (expect.status ? String(expect.status) : "2xx");

/** The params of a route ($name) */
export const routeParams = (route) => [...route.matchAll(/\$(\w+)/g)].map((m) => m[1]);

/** The values of the params of a route in a path ({employeeId: "4"}), or null if it does not match */
export function matchRoute(route, path) {
  const names = routeParams(route);
  const regex = new RegExp(`^${route.replace(/[.*+?^{}()|[\]\\]/g, "\\$&").replace(/\$(\w+)/g, "([^/]+)")}$`);
  const m = path.match(regex);
  return m ? Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) : null;
}

/** A route with its params filled in */
export const fillRoute = (route, values) => route.replace(/\$(\w+)/g, (_, n) => encodeURIComponent(values[n] ?? ""));

/** A value as the student types it in a field: empty → left out (undefined), null, true, false,
 *  numbers, and the rest as text */
export function parseValue(text) {
  const t = String(text ?? "").trim();
  if (t === "") return undefined;
  if (t === "null") return null;
  if (t === "true" || t === "false") return t === "true";
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t;
}

/** A value in a field (the opposite of parseValue) */
export const valueText = (v) => (v === undefined ? "" : v === null ? "null" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** The definition of a unit test in the short form, as it is saved in tests/*.json:
 *  {description, endpoint, "METHOD /path": body, as, expect}. endpoint: the one it tests
 *  ("GET /departments/$departmentId"); body: {param: value} (undefined left out) or null;
 *  expect: {status, message} (status undefined: any 2xx) */
export function buildDefinition({ description, endpoint, method, path, body, as, expect }) {
  const def = {};
  if (description) def.description = description;
  if (endpoint) def.endpoint = endpoint;
  const sent = body ? Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) : null;
  def[`${method} ${path}`] = method === "POST" || method === "PUT" ? sent ?? {} : null;
  if (as !== undefined && as !== null && as !== "") def.as = parseValue(as);
  const e = Object.fromEntries(Object.entries(expect ?? {}).filter(([, v]) => v !== undefined && v !== ""));
  if (Object.keys(e).length === 1 && e.status !== undefined) def.expect = e.status;
  else if (Object.keys(e).length) def.expect = e;
  return def;
}
