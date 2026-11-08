// The fields of a request to the student's API, as a test defines it:
// the endpoint it calls (its params of the route and of the query string, and its body, as
// fields), the user it is sent as and what it expects (a status and a part of the message).
import { html, options } from "../lib/html.js";
import { quietApi, loadEndpoints } from "../lib/api.js";
import { attempt } from "../lib/ui.js";
import { routeParams, matchRoute, fillRoute, parseValue, valueText, buildDefinition, queryOf, withQuery } from "../lib/testing.js";

// The common answers, to choose what a request expects
const STATUSES = [["", "Any 2xx (it works)"], [200, "200 OK"], [201, "201 Created"], [400, "400 Bad request"],
  [401, "401 Without a session"], [403, "403 Forbidden (role or owner)"], [404, "404 Not found"], [409, "409 Conflict"],
  [500, "500 Server error"]];

export const endpointKey = (e) => `${e.method} ${e.route}`;

/** What a request needs to be written: the endpoints that it can call (the student's, and login
 *  and logout, Silence's), the API prefix and the users. null if Silence cannot be reached. */
export async function requestContext(app) {
  const eps = await attempt(() => loadEndpoints({ quiet: true }));
  if (!eps) return null;
  const endpoints = [...eps.endpoints].sort((a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method));
  const auth = app.status.auth;
  let users = [];
  if (auth.linked) {
    users = (await quietApi("/users").catch(() => null))?.users ?? [];
    const silence = (route, params) => ({ method: "POST", route, name: route.slice(1), table: auth.table,
      request_body_params: params, silence: true });
    if (auth.login) {
      endpoints.push(silence("/login", [auth.identifier.split(".").pop(), auth.password]));
      endpoints.push(silence("/logout", []));
    }
  }
  return { apiPrefix: eps.apiPrefix, endpoints, users };
}

/** The endpoint that a request calls: the one it says, or the one whose route matches it */
export function endpointOfRequest(endpoints, definition, request) {
  return endpoints.find((e) => endpointKey(e) === definition?.endpoint)
    ?? endpoints.find((e) => e.method === request.method && matchRoute(e.route, request.path.split("?")[0]));
}

/**
 * Draws the fields in container (inside a form) and returns {endpoint(), definition(extra),
 * set(base)}. options:
 *   context: requestContext()
 *   base: {request, expect, definition} to start from (a unit test, a step), or null
 *   endpoint: the key of the endpoint to start with (when there is no base)
 *   id: a prefix for the ids of the fields (several forms in a page)
 *   onChange: () => {}  after every change
 */
export function requestForm(container, { context, base = null, endpoint = null, id = "r", onChange = () => {} }) {
  const endpoints = [...context.endpoints];
  let typed = {};
  let current = null;

  /** Starts again from a request (or from nothing) */
  function set(start) {
    const req = start?.request;
    current = req ? endpointOfRequest(endpoints, start.definition, req) : endpoints.find((e) => endpointKey(e) === endpoint) ?? endpoints[0];
    if (req && !current) {  // Its request as it is written (e.g., an endpoint that no longer exists)
      current = { method: req.method, route: req.path.split("?")[0], name: "request",
        request_body_params: Object.keys(req.body ?? {}), written: true, definitionEndpoint: start.definition?.endpoint };
      endpoints.push(current);
    }
    typed = {
      ...Object.fromEntries(Object.entries(current && req ? matchRoute(current.route, req.path.split("?")[0]) ?? {} : {})
        .map(([k, v]) => [`param:${k}`, v])),
      ...Object.fromEntries(Object.entries(req?.body ?? {}).map(([k, v]) => [`body:${k}`, valueText(v)])),
      ...Object.fromEntries(Object.entries(req ? queryOf(req.path) : {}).map(([k, v]) => [`query:${k}`, v])),
    };
    container.innerHTML = html`
      <div class="sa-field sa-span"><label class="uk-form-label" for="${id}-endpoint">Endpoint</label>
        <select class="uk-select" id="${id}-endpoint" data-request="endpoint">
          ${options(endpoints.map((e, i) => [i, `${e.method} ${context.apiPrefix}${e.route}${e.silence ? " (Silence)"
            : e.written ? " (as written)" : ""}`]), endpoints.indexOf(current))}
        </select></div>
      <div class="sa-span sa-form" data-request="params"></div>
      <div class="sa-field"><label class="uk-form-label" for="${id}-as">As user</label>
        <select class="uk-select" id="${id}-as" data-request="as">${options(context.users.map((u) =>
          [u.id, `${u.identifier}${u.role ? ` (${u.role})` : ""}`]), req?.as ?? "", "Without a session")}</select></div>
      <div class="sa-field"><label class="uk-form-label" for="${id}-status">It expects the status</label>
        <select class="uk-select" id="${id}-status" data-request="status">${options(STATUSES, start?.expect?.status ?? "")}</select></div>
      <div class="sa-field"><label class="uk-form-label" for="${id}-message">And a message that contains (optional)</label>
        <input class="uk-input" id="${id}-message" data-request="message" value="${start?.expect?.message ?? ""}"
          placeholder="e.g. validSalary"></div>`;
    drawParams();
  }

  const field = (name) => container.querySelector(`[data-request="${name}"]`);
  const selected = () => endpoints[Number(field("endpoint").value)];

  function drawParams() {
    const e = selected();
    const params = routeParams(e.route);
    const query = e.query_params ?? [];
    const body = e.method === "POST" || e.method === "PUT" ? e.request_body_params ?? [] : [];
    const input = (kind, p, help) => html`<div class="sa-field"><label class="uk-form-label" for="${id}-${kind}-${p}">${help}</label>
      <input class="uk-input" id="${id}-${kind}-${p}" data-param="${kind}:${p}" value="${typed[`${kind}:${p}`] ?? ""}"
        ${kind === "param" ? "required" : html`placeholder="(left out if empty)"`}></div>`;
    field("params").innerHTML = html`
      ${params.map((p) => input("param", p, `$${p} (in the route)`))}
      ${query.map((p) => input("query", p, `${p} (in the query string)`))}
      ${body.map((p) => input("body", p, `${p} (in the body)`))}
      ${!params.length && !query.length && !body.length ? html`<p class="uk-text-muted sa-small">This endpoint has no params.</p>` : ""}`;
  }

  container.addEventListener("input", (event) => {
    const p = event.target.dataset.param;
    if (p) typed[p] = event.target.value;
    onChange();
  });
  container.addEventListener("change", (event) => {
    if (event.target.dataset.request === "endpoint") drawParams();
    onChange();
  });

  /** The definition of the request (as a unit test is saved), plus extra keys (description) */
  function definition({ description = "" } = {}) {
    const e = selected();
    const value = (p) => container.querySelector(`[data-param="${p}"]`)?.value ?? "";
    const params = Object.fromEntries(routeParams(e.route).map((p) => [p, value(`param:${p}`)]));
    const query = Object.fromEntries((e.query_params ?? []).map((p) => [p, value(`query:${p}`)]));
    const body = e.method === "POST" || e.method === "PUT"
      ? Object.fromEntries((e.request_body_params ?? []).map((p) => [p, parseValue(value(`body:${p}`))])) : null;
    return buildDefinition({
      description,
      endpoint: e.silence ? undefined : e.written ? e.definitionEndpoint : endpointKey(e),
      method: e.method,
      path: withQuery(fillRoute(e.route, params), query),
      body,
      as: field("as").value,
      expect: { status: parseValue(field("status").value), message: field("message").value.trim() || undefined },
    });
  }

  set(base);
  return { endpoint: selected, definition, set };
}
