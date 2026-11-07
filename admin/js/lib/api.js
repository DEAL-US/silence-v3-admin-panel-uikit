// The client of Silence's admin API (/_silence/v1, see panel.json). The actions (not the reads)
// and the errors go to the console.
import { logEvent } from "../components/console.js";
import { describe, whereIs } from "./activity.js";

export const API = "/_silence/v1";

/** When the panel last changed something (so as not to report its own changes as external) */
export const activity = { last: 0 };

/** Calls the admin API and returns its JSON, or throws an Error with its message.
 *  etag: the version of the file that is changed (If-Match), so as not to overwrite changes
 *  made meanwhile in another place (412). quiet: nothing to the console. */
export async function api(path, method = "GET", body = undefined, etag = undefined, { quiet = false } = {}) {
  if (method !== "GET") activity.last = Date.now();
  const options = { method, headers: {} };
  if (etag !== undefined) options.headers["If-Match"] = etag;
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(API + path, options);
  } catch {
    if (!quiet) logEvent("Silence", `Cannot reach Silence (${method} ${path}): is 'silence run' running?`, { ok: false });
    throw new Error("Cannot reach Silence: is 'silence run' running?");
  }
  const data = await response.json().catch(() => ({}));
  if (!quiet && (method !== "GET" || !response.ok)) {
    const [source, message] = describe(method, path, body, data);
    const ok = response.ok && !(path.startsWith("/database/test") && !data.ok);
    logEvent(source, response.ok ? message : `${message}: ${data.message || `error ${response.status}`}`,
      { ok, details: response.ok ? undefined : data, href: whereIs(path) });
  }
  if (!response.ok) throw new Error(data.message || `Error ${response.status}`);
  return data;
}

/** The same, without anything to the console */
export const quietApi = (path, method = "GET", body = undefined) => api(path, method, body, undefined, { quiet: true });
