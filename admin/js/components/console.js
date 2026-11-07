// The console at the bottom of the panel: the requests that the panel sends to the student's
// API (trying an endpoint, the steps of a composite test) and the results of the tests, with
// the errors highlighted. Kept in sessionStorage while the tab is open.
import { esc, json } from "../ui.js";

const KEY = "silence-admin-console";
const MAX = 200;

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

/**
 * Adds an entry: {source, method, path, status, ms, ok, message, response}.
 * source: where it comes from ("Try", "Composite flow", "Test")
 */
export function logRequest(entry) {
  entries.push({ time: new Date().toLocaleTimeString(), ...entry });
  entries = entries.slice(-MAX);
  store(entries);
  draw();
}

function statusClass(e) {
  if (!e.status) return "sa-console__status--error";
  if (e.status >= 500) return "sa-console__status--error";
  if (e.status >= 400) return e.ok ? "sa-console__status--expected" : "sa-console__status--warn";
  return "sa-console__status--ok";
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
      <span class="sa-toolbar__spacer"></span>
      ${open ? `<button type="button" class="uk-button uk-button-default uk-button-small" id="console-clear">Clear</button>` : ""}
    </div>
    ${open ? `<div class="sa-console__body">
      ${entries.length ? [...entries].reverse().map((e, i) => `
        <details class="sa-console__line ${e.ok ? "" : "sa-console__line--fail"}">
          <summary>
            <span class="sa-console__time">${esc(e.time)}</span>
            <span class="sa-console__source">${esc(e.source ?? "")}</span>
            <span class="sa-method sa-method--${esc(e.method)}">${esc(e.method)}</span>
            <span class="sa-route">${esc(e.path)}</span>
            <span class="sa-console__status ${statusClass(e)}">${e.status || "—"}</span>
            ${e.ms !== undefined ? `<span class="uk-text-muted">${e.ms} ms</span>` : ""}
            ${e.message ? `<span class="sa-console__message">${esc(e.message)}</span>` : ""}
          </summary>
          <pre class="sa-pre">${json(e.response ?? null)}</pre>
        </details>`).join("") : `<p class="uk-text-muted sa-small">No requests yet: try an endpoint or run a composite test.</p>`}
    </div>` : ""}`;
  root.querySelector("#console-toggle").addEventListener("click", () => {
    open = !open;
    draw();
  });
  root.querySelector("#console-clear")?.addEventListener("click", () => {
    entries = [];
    store(entries);
    draw();
  });
}

export function initConsole() {
  draw();
}
