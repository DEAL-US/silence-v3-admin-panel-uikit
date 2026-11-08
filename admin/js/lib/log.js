// All the activity, which the Logs page shows (pages/logs.js):
//   - the requests to the student's app, from the log that Silence writes (admin/logs/requests.log):
//     those of the web app, of the student's own tools and of the panel (trying an endpoint, unit
//     tests and scenarios: the panel records those itself, with their responses);
//   - actions on Silence (connecting to the database, linking the users table, saving an
//     endpoint, opening a session as a user...);
//   - changes in the state of the project (database connected or lost, errors in the files...).
// The panel's entries are kept in sessionStorage while the tab is open; the log is read when the
// Logs page is shown and with its Refresh button. Each entry may link to where it happened. The
// requests of a run of tests or of a scenario go together, in a group with its result.
import { parseLog, notFromPanel } from "./requestlog.js";
import { quietReadFile, deleteFile, LOG } from "./files.js";

const KEY = "silence-admin-console";
const MAX = 1000;
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

let entries = load();      // The panel's own entries
let lines = [];            // All the lines of the log (for the statistics)
let etag = "";             // The version of the log that was read
let panelRequests = [];    // Requests of the panel that it does not show (e.g., rows to propose values)
let group = null;          // The group that the entries go to now (a run of tests or a scenario)
const listeners = new Set();

const changed = () => listeners.forEach((fn) => fn());

/** fn() is called when the activity changes; returns how to stop */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function add(entry) {
  const at = Date.now();
  entries.push({ at, time: new Date(at).toLocaleTimeString(), ...(group ? { group } : {}), ...entry });
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

/** From now on, the entries go to a group (e.g., "Run 95 tests"), until endGroup */
export function beginGroup(source, message, href) {
  const id = `g${Date.now()}`;
  add({ kind: "group", id, source, message, ok: true, href });
  group = id;
}

/** The end of the group, with its result (e.g., "93 of 95 tests passed") */
export function endGroup(result, ok) {
  const entry = entries.find((e) => e.kind === "group" && e.id === group);
  group = null;
  if (entry) {
    entry.message = `${entry.message}: ${result}`;
    entry.ok = ok;
    store();
    changed();
  }
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

/** Clears everything: deletes the log of requests (the statistics start again) and the panel's entries */
export async function clearAll() {
  await readLog();
  if (lines.length) await deleteFile(LOG, etag, null);
  lines = [];
  etag = "";
  entries = [];
  panelRequests = [];
  store();
  changed();
}

/** The activity in order: the panel's entries and the lines of the log that it did not send (the
 *  entries of a group, inside it: {kind: "group", ..., children}). from: "panel" (the panel's own
 *  entries), "api", "silence" or "web" (the lines of the log of each one) */
export function activity() {
  const sent = [...panelRequests, ...entries.filter((e) => e.kind === "request")];
  const logged = notFromPanel(lines, sent).map((l) => ({
    kind: "request", from: l.group, at: l.at, time: new Date(l.at).toLocaleTimeString(), source: GROUPS[l.group] ?? l.group,
    method: l.method, path: decodeURIComponent(l.path), route: l.route, status: l.status, ms: l.ms, message: l.message,
    ok: l.status < 400,
  }));
  const groups = new Map();
  const top = [];
  for (const e of entries) {
    if (e.kind === "group") {
      const g = { ...e, from: "panel", children: [] };
      groups.set(e.id, g);
      top.push(g);
    } else if (e.group && groups.has(e.group)) {
      groups.get(e.group).children.push({ ...e, from: "panel" });
    } else {
      top.push({ ...e, from: "panel" });
    }
  }
  return [...top, ...logged].sort((a, b) => (a.at ?? 0) - (b.at ?? 0)).slice(-MAX);
}

/** The panel's entries that failed (for the badge of Logs in the menu; a group counts once) */
export const failures = () => entries.filter((e) => !e.ok && !e.group).length;
