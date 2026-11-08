// The student's API: how to call it (as Silence says in GET /_silence/v1/), the user that the
// panel acts as (its session token) and the requests, which go to the activity (Logs).
import { logRequest, logEvent, notePanelRequest } from "./log.js";

export const studentApi = { prefix: "/api", sessionHeader: "Token" };

const SESSION_KEY = "silence-admin-session";

export const session = {
  /** {token, label, id} or null */
  get() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY));
    } catch {
      return null;
    }
  },
  set(value) {
    try {
      if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // Storage blocked: the session is not remembered
    }
    logEvent("Users", value ? `Trying the API as ${value.label}` : "Trying the API without a session");
    document.dispatchEvent(new CustomEvent("sa-session"));
  },
};

/** Sends a request to the student's API, as the current session or the given token, and logs it
 *  in the activity. source: who sends it ("Try", "Test …"); expect(status, data): whether it went
 *  as expected (by default, a status below 400); href: where its line goes. */
export async function callApi(method, path, body, { source = "Try", token, expect, href } = {}) {
  const options = { method, headers: {} };
  const current = token === undefined ? session.get()?.token : token;
  if (current) options.headers[studentApi.sessionHeader] = current;
  if (body !== undefined && body !== null && method !== "GET" && method !== "DELETE") {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const started = performance.now();
  let status = 0;
  let data = null;
  try {
    const response = await fetch(studentApi.prefix + path, options);
    status = response.status;
    const text = await response.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  } catch (error) {
    data = error.message;
  }
  const ms = Math.round(performance.now() - started);
  const ok = expect ? expect(status, data) : status > 0 && status < 400;
  logRequest({ source, method, path: studentApi.prefix + path, status, ms, ok, response: data, href,
    message: status >= 400 && data && typeof data === "object" ? data.message : "" });
  return { status, data, ms };
}

/** GET without going to the activity (e.g., rows to propose values), with the current session */
export async function peekApi(path) {
  const headers = {};
  const token = session.get()?.token;
  if (token) headers[studentApi.sessionHeader] = token;
  const response = await fetch(studentApi.prefix + path, { headers });
  notePanelRequest({ method: "GET", path: studentApi.prefix + path, status: response.status });
  return response.json();
}
