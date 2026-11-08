// All the activity, which the Logs page shows (pages/logs.js):
//   - the requests to the student's app, from the log that Silence writes (admin/logs/requests.log):
//     those of the web app, of the student's own tools and of the panel (trying an endpoint, unit
//     tests and scenarios: the panel records those itself, with their responses);
//   - actions on Silence (connecting to the database, linking the users table, saving an
//     endpoint, opening a session as a user...);
//   - changes in the state of the project (database connected or lost, errors in the files...).
// The panel's entries are kept in sessionStorage while the tab is open; the log is read when the
// Logs page is shown and with its Refresh button. Each entry may link to where it happened.
import { parseLog, notFromPanel } from "./requestlog.js";
import { quietReadFile, LOG } from "./files.js";

const KEY = "silence-admin-console";
const CLEARED_KEY = "silence-admin-console-cleared";
const MAX = 500;
const GROUPS = { api: "Your API", silence: "Silence", web: "Your web app" };

function load() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY)) ?? [];
  } catch {
    return [];
  }
}

function store() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX)));
  } catch {
    // Storage blocked or full: the entries only live in memory
  }
}

function cleared() {
  try {
    return Number(sessionStorage.getItem(CLEARED_KEY)) || 0;
  } catch {
    return 0;
  }
}

let entries = load();      // The panel's own entries
let lines = [];            // All the lines of the log (for the statistics)
let etag = "";             // The version of the log that was read
let panelRequests = [];    // Requests of the panel that it does not show (e.g., rows to propose values)
const listeners = new Set();

const changed = () => listeners.forEach((fn) => fn());

/** fn() is called when the activity changes; returns how to stop */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function add(entry) {
  const at = Date.now();
  entries.push({ at, time: new Date(at).toLocaleTimeString(), ...entry });
  entries = entries.slice(-MAX);
  store();
  changed();
}

/** A request of the panel to the student's API: {source, method, path, status, ms, ok, message, response, href} */
export function logRequest(entry) {
  add({ kind: "request", ...entry });
}

/** Something that happened: an action on Silence or a change in the project.
 *  source: "Database", "Users", "Endpoints"...; details: shown when the entry is opened. */
export function logEvent(source, message, { ok = true, details, href } = {}) {
  add({ kind: "event", source, message, ok, response: details, href });
}

/** A request of the panel to the student's API that is not shown (nor its line of the log) */
export function notePanelRequest(request) {
  panelRequests.push({ at: Date.now(), ...request });
  panelRequests = panelRequests.slice(-MAX);
}

/** Reads the log of requests again. Returns false if it cannot be read */
export async function readLog() {
  const file = await quietReadFile(LOG).catch(() => null);
  if (!file) return false;
  lines = parseLog(file.data);
  etag = file.etag;
  changed();
  return true;
}

/** The log as it was read: its lines (all of them) and its version */
export const log = () => ({ lines, etag });

/** The log was deleted (it starts again) */
export function logDeleted() {
  lines = [];
  etag = "";
  changed();
}

/** Forgets what has been seen until now (the log is kept: it is deleted with Reset) */
export function clearActivity() {
  entries = [];
  store();
  try {
    sessionStorage.setItem(CLEARED_KEY, String(Date.now()));
  } catch {
    // Without storage, cleared until the panel is reloaded
  }
  changed();
}

/** The activity in order: the panel's entries and the lines of the log that it did not send */
export function activity() {
  const since = cleared();
  const sent = [...panelRequests, ...entries.filter((e) => e.kind === "request")];
  const logged = notFromPanel(lines.filter((l) => l.at >= since), sent).map((l) => ({
    kind: "request", at: l.at, time: new Date(l.at).toLocaleTimeString(), source: GROUPS[l.group] ?? l.group,
    method: l.method, path: decodeURIComponent(l.path), status: l.status, ms: l.ms, message: l.message, ok: l.status < 400,
  }));
  return [...entries, ...logged].sort((a, b) => (a.at ?? 0) - (b.at ?? 0)).slice(-MAX);
}

/** The panel's entries that failed (for the badge of Logs in the menu) */
export const failures = () => entries.filter((e) => !e.ok).length;
