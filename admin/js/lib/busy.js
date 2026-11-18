// The bottom of the sidebar (#busy): what the panel is waiting for and what it has to say, in one
// place, one box each (they pile up, the newest at the bottom).
//   - Waiting: the calls to Silence and to the student's API that take a while (e.g., generating
//     the endpoints, creating the database again) and the tests that run, with the seconds that
//     they have been running and, if they know them, how many steps are done (a bar). Only what
//     lasts more than a moment is shown, and it goes when it ends: its result is a message.
//   - Messages (toast() of ui.js): the result of an action, an error… They stay until they are
//     closed (their ×, or Esc for all of them), cut to a few lines (a click shows all of it); with
//     too many, the oldest ones go.

const SHOW_AFTER = 300;  // ms: the quick ones are not shown (no flicker)
const MAX_MESSAGES = 6;
const items = new Map();  // id → {kind: "task" | "message", ...}
let next = 1;
let ticker = null;

/** Starts a task: returns {update(label, done, total), end()} */
export function begin(label, { done = null, total = null } = {}) {
  const id = next++;
  items.set(id, { id, kind: "task", label, done, total, start: Date.now() });
  setTimeout(draw, SHOW_AFTER + 10);
  ticker ??= setInterval(draw, 1000);
  return {
    update(newLabel, newDone = null, newTotal = null) {
      const t = items.get(id);
      if (!t) return;
      Object.assign(t, { label: newLabel ?? t.label, done: newDone, total: newTotal });
      draw();
    },
    end() {
      items.delete(id);
      draw();
    },
  };
}

/** Runs an async action as a task */
export async function during(label, action) {
  const task = begin(label);
  try {
    return await action();
  } finally {
    task.end();
  }
}

/** A message, until it is closed. type: info, success, warning or error */
export function notify(text, type = "info") {
  const id = next++;
  items.set(id, { id, kind: "message", text: String(text), type, start: Date.now() });
  const messages = [...items.values()].filter((i) => i.kind === "message");
  messages.slice(0, Math.max(0, messages.length - MAX_MESSAGES)).forEach((m) => items.delete(m.id));
  draw();
}

/** Closes all the messages */
export function closeMessages() {
  for (const i of [...items.values()]) if (i.kind === "message") items.delete(i.id);
  draw();
}

const seconds = (ms) => `${Math.round(ms / 1000)} s`;
const ICONS = { success: "✓", error: "✗", warning: "!", info: "i" };

/** The box of an item: drawn once and then only updated, so that a spinner keeps turning */
function boxOf(container, item) {
  let box = container.querySelector(`[data-item="${item.id}"]`);
  if (box) return box;
  box = document.createElement("div");
  box.dataset.item = item.id;
  if (item.kind === "task") {
    box.className = "sa-busy";
    box.innerHTML = `<div class="sa-busy__row"><span class="sa-busy__icon"><span uk-spinner="ratio: .55"></span></span>
      <span class="sa-busy__label"></span></div>
      <progress class="uk-progress sa-busy__bar"></progress>
      <div class="sa-busy__meta"></div>`;
  } else {
    box.className = `sa-busy sa-busy--${item.type}`;
    box.innerHTML = `<div class="sa-busy__row"><span class="sa-busy__icon"></span>
      <span class="sa-busy__label sa-busy__label--cut" title="Click to see all of it"></span>
      <button type="button" class="sa-busy__close" uk-close aria-label="Close"></button></div>`;
    box.querySelector(".sa-busy__icon").textContent = ICONS[item.type] ?? "i";
    const label = box.querySelector(".sa-busy__label");
    label.textContent = item.text;
    // Cut to a few lines; a click shows all of it (and cuts it again)
    label.addEventListener("click", () => label.classList.toggle("sa-busy__label--cut"));
    box.querySelector(".sa-busy__close").addEventListener("click", () => {
      items.delete(item.id);
      draw();
    });
  }
  container.append(box);
  return box;
}

function draw() {
  const container = document.querySelector("#busy");
  if (![...items.values()].some((i) => i.kind === "task")) {
    clearInterval(ticker);
    ticker = null;
  }
  if (!container) return;
  const now = Date.now();
  const shown = [...items.values()].filter((i) => i.kind === "message" || now - i.start >= SHOW_AFTER);
  const ids = new Set(shown.map((i) => String(i.id)));
  container.querySelectorAll("[data-item]").forEach((b) => {
    if (!ids.has(b.dataset.item)) b.remove();
  });
  container.hidden = !shown.length;
  for (const i of shown) {
    const box = boxOf(container, i);
    if (i.kind !== "task") continue;
    box.querySelector(".sa-busy__label").textContent = i.label;
    const bar = box.querySelector(".sa-busy__bar");
    bar.hidden = !i.total;
    if (i.total) Object.assign(bar, { value: i.done ?? 0, max: i.total });
    const elapsed = now - i.start;
    box.querySelector(".sa-busy__meta").textContent = [
      i.total ? `${i.done ?? 0} of ${i.total}` : "",
      elapsed >= 1000 ? seconds(elapsed) : "",
    ].filter(Boolean).join(" · ");
  }
}

/** What a call to Silence's admin API is doing, in words (for the sidebar) */
export function labelOf(method, path) {
  const p = path.split("?")[0];
  if (path.startsWith("/?updates")) return "Checking for updates (on the network)…";
  if (method === "POST" && p === "/endpoints/generate") return "Generating the endpoints…";
  if (method === "POST" && p === "/database/reload") return "Creating the database again…";
  if (method === "POST" && p === "/database/test") return "Connecting to the database…";
  if (p === "/schema") return "Reading the database…";
  if (p === "/status") return "Reading the project…";
  if (p.startsWith("/users")) return method === "GET" ? "Reading the users…" : "Saving…";
  if (p.startsWith("/tests")) return "Reading the tests…";
  if (p.startsWith("/files") || p.startsWith("/config")) return method === "GET" ? "Reading the project…" : "Saving…";
  return method === "GET" ? "Waiting for Silence…" : "Saving…";
}
