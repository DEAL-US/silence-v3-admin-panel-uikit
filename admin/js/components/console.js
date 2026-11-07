// The console at the bottom of the panel: all its activity, with the errors highlighted.
//   - requests to the student's API (trying an endpoint, unit and composite tests);
//   - actions on Silence (connecting to the database, linking the users table, saving an
//     endpoint, opening a session as a user...);
//   - changes in the state of the project (database connected or lost, files reloaded...).
// Kept in sessionStorage while the tab is open. The student also sees the requests to the API
// in the console where 'silence run' runs.
import { esc, json } from "../ui.js";

const KEY = "silence-admin-console";
const MAX = 300;

function load() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY)) ?? [];
  } catch {
    return [];
  }
}

function store(entries) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX)));
  } catch {
    // Storage blocked or full: the console only lives in memory
  }
}

let entries = load();
let open = false;
let onlyFailures = false;

function add(entry) {
  entries.push({ time: new Date().toLocaleTimeString(), ...entry });
  entries = entries.slice(-MAX);
  store(entries);
  draw();
}

/** A request to the student's API: {source, method, path, status, ms, ok, message, response}. */
export function logRequest(entry) {
  add({ kind: "request", ...entry });
}

/** Something that happened: an action on Silence or a change in the project.
 *  source: "Database", "Users", "Endpoints"...; details: shown when the line is opened. */
export function logEvent(source, message, { ok = true, details, href } = {}) {
  add({ kind: "event", source, message, ok, response: details, href });
}

function statusClass(e) {
  if (!e.status) return "sa-console__status--error";
  if (e.status >= 500) return "sa-console__status--error";
  if (e.status >= 400) return e.ok ? "sa-console__status--expected" : "sa-console__status--warn";
  return "sa-console__status--ok";
}

function line(e) {
  const detail = e.response !== undefined && e.response !== null && e.response !== "";
  const summary = e.kind === "event"
    ? `<span class="sa-console__time">${esc(e.time)}</span>
       <span class="sa-console__source">${esc(e.source ?? "")}</span>
       <span class="sa-console__event">${esc(e.message)}</span>`
    : `<span class="sa-console__time">${esc(e.time)}</span>
       <span class="sa-console__source">${esc(e.source ?? "")}</span>
       <span class="sa-method sa-method--${esc(e.method)}">${esc(e.method)}</span>
       <span class="sa-route">${esc(e.path)}</span>
       <span class="sa-console__status ${statusClass(e)}">${e.status || "—"}</span>
       ${e.ms !== undefined ? `<span class="uk-text-muted">${e.ms} ms</span>` : ""}
       ${e.message ? `<span class="sa-console__message">${esc(e.message)}</span>` : ""}`;
  const go = e.href ? `<a class="sa-console__go" href="${esc(e.href)}" title="Go there" uk-icon="icon: arrow-right; ratio: .8"></a>` : "";
  const cls = `sa-console__line ${e.ok ? "" : "sa-console__line--fail"} sa-console__line--${e.kind ?? "request"}`;
  return detail
    ? `<details class="${cls}"><summary>${summary}${go}</summary><pre class="sa-pre">${json(e.response)}</pre></details>`
    : `<div class="${cls}"><div class="sa-console__summary">${summary}${go}</div></div>`;
}

function draw() {
  const root = document.querySelector("#console");
  if (!root) return;
  const errors = entries.filter((e) => !e.ok).length;
  root.classList.toggle("sa-console--open", open);
  root.innerHTML = `
    <div class="sa-console__bar">
      <button type="button" class="sa-console__toggle" id="console-toggle" aria-expanded="${open}">
        <span uk-icon="icon: ${open ? "chevron-down" : "chevron-up"}; ratio: .8"></span>
        Console <span class="uk-badge">${entries.length}</span>
        ${errors ? `<span class="uk-badge sa-console__errors">${errors} failed</span>` : ""}
      </button>
      ${!open && entries.length ? `<span class="sa-console__last">${lastText(entries[entries.length - 1])}</span>` : ""}
      <span class="sa-toolbar__spacer"></span>
      ${open ? `<label class="sa-console__filter"><input class="uk-checkbox" type="checkbox" id="console-failures"
        ${onlyFailures ? "checked" : ""}> Only failures</label>
        <button type="button" class="uk-button uk-button-default uk-button-small" id="console-clear">Clear</button>` : ""}
    </div>
    ${open ? `<div class="sa-console__body">
      ${shown().length ? [...shown()].reverse().map(line).join("")
        : `<p class="uk-text-muted sa-small">${entries.length ? "No failures." : "Nothing yet: the activity of the panel will appear here."}</p>`}
    </div>` : ""}`;
  root.querySelector("#console-toggle").addEventListener("click", () => {
    open = !open;
    draw();
  });
  root.querySelector("#console-failures")?.addEventListener("change", (event) => {
    onlyFailures = event.target.checked;
    draw();
  });
  root.querySelector("#console-clear")?.addEventListener("click", () => {
    entries = [];
    store(entries);
    draw();
  });
}

const shown = () => (onlyFailures ? entries.filter((e) => !e.ok) : entries);

/** The last entry, in one line, for the closed console */
function lastText(e) {
  const text = e.kind === "event" ? `${e.source}: ${e.message}` : `${e.method} ${e.path} ${e.status || ""}`;
  return `<span class="${e.ok ? "" : "sa-console__message"}">${esc(text)}</span>`;
}

export function initConsole() {
  draw();
}
