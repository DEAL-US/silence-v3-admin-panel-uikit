// The console at the bottom of the panel: all its activity, with the errors highlighted.
//   - requests to the student's API (trying an endpoint, unit tests and scenarios);
//   - actions on Silence (connecting to the database, linking the users table, saving an
//     endpoint, opening a session as a user...);
//   - changes in the state of the project (database connected or lost, files reloaded...).
// Each line may link to where it happened. Kept in sessionStorage while the tab is open. The
// student also sees the requests to the API in the console where 'silence run' runs.
import { html, json } from "../lib/html.js";

const KEY = "silence-admin-console";
const MAX = 300;

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
    // Storage blocked or full: the console only lives in memory
  }
}

let entries = load();
let open = false;
let onlyFailures = false;

function add(entry) {
  entries.push({ time: new Date().toLocaleTimeString(), ...entry });
  entries = entries.slice(-MAX);
  store();
  draw();
}

/** A request to the student's API: {source, method, path, status, ms, ok, message, response, href}. */
export function logRequest(entry) {
  add({ kind: "request", ...entry });
}

/** Something that happened: an action on Silence or a change in the project.
 *  source: "Database", "Users", "Endpoints"...; details: shown when the line is opened. */
export function logEvent(source, message, { ok = true, details, href } = {}) {
  add({ kind: "event", source, message, ok, response: details, href });
}

function statusClass(e) {
  if (!e.status || e.status >= 500) return "sa-console__status--error";
  if (e.status >= 400) return e.ok ? "sa-console__status--expected" : "sa-console__status--warn";
  return "sa-console__status--ok";
}

function line(e) {
  const summary = html`
    <span class="sa-console__time">${e.time}</span>
    <span class="sa-console__source">${e.source ?? ""}</span>
    ${e.kind === "event"
      ? html`<span class="sa-console__event">${e.message}</span>`
      : html`<span class="sa-method sa-method--${e.method}">${e.method}</span>
        <span class="sa-route">${e.path}</span>
        <span class="sa-console__status ${statusClass(e)}">${e.status || "—"}</span>
        ${e.ms !== undefined ? html`<span class="uk-text-muted">${e.ms} ms</span>` : ""}
        ${e.message ? html`<span class="sa-console__message">${e.message}</span>` : ""}`}
    ${e.href ? html`<a class="sa-console__go" href="${e.href}" title="Go there" aria-label="Go there"
      uk-icon="icon: arrow-right; ratio: .8"></a>` : ""}`;
  const cls = `sa-console__line sa-console__line--${e.kind ?? "request"}${e.ok ? "" : " sa-console__line--fail"}`;
  const detail = e.response !== undefined && e.response !== null && e.response !== "";
  return detail
    ? html`<details class="${cls}"><summary>${summary}</summary><pre class="sa-pre">${json(e.response)}</pre></details>`
    : html`<div class="${cls}"><div class="sa-console__summary">${summary}</div></div>`;
}

const shown = () => (onlyFailures ? entries.filter((e) => !e.ok) : entries);

/** The last entry, in one line, for the closed console */
function last(e) {
  const text = e.kind === "event" ? `${e.source}: ${e.message}` : `${e.method} ${e.path} ${e.status || ""}`;
  return html`<span class="sa-console__last ${e.ok ? "" : "sa-console__message"}">${text}</span>`;
}

function draw() {
  const root = document.querySelector("#console");
  if (!root) return;
  const failed = entries.filter((e) => !e.ok).length;
  root.classList.toggle("sa-console--open", open);
  root.innerHTML = html`
    <div class="sa-console__bar">
      <button type="button" class="sa-console__toggle" id="console-toggle" aria-expanded="${open}" aria-controls="console-body">
        <span uk-icon="icon: ${open ? "chevron-down" : "chevron-up"}; ratio: .8"></span>
        Console <span class="uk-badge">${entries.length}</span>
        ${failed ? html`<span class="uk-badge sa-console__errors">${failed} failed</span>` : ""}
      </button>
      ${!open && entries.length ? last(entries[entries.length - 1]) : ""}
      <span class="sa-toolbar__spacer"></span>
      ${open ? html`<label class="sa-console__filter"><input class="uk-checkbox" type="checkbox" id="console-failures"
          ${onlyFailures ? "checked" : ""}> Only failures</label>
        <button type="button" class="uk-button uk-button-default uk-button-small" id="console-clear">Clear</button>` : ""}
    </div>
    ${open ? html`<div class="sa-console__body" id="console-body">
      ${shown().length ? [...shown()].reverse().map(line)
        : html`<p class="uk-text-muted sa-small">${entries.length ? "No failures." : "Nothing yet: the activity of the panel will appear here."}</p>`}
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
    store();
    draw();
  });
}

export function initConsole() {
  draw();
}
