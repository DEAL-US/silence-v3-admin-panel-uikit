// An ordered list that the student arranges: each item with buttons to move it up and down and
// to remove it (the steps of a composite test, the database scripts...).
import { html, iconButton } from "../lib/html.js";

/**
 * Draws the list in an <ol> and returns {items(), set(items), add(item)}.
 * options.items: the initial items (texts)
 * options.render: (item) => html   how an item is shown (default: as code)
 * options.empty: what to say when it is empty
 * options.labels: {up, down, remove}  the titles of the buttons
 * options.onChange: (items) => {}   after every change
 */
export function orderedList(list, options) {
  let items = [...(options.items ?? [])];
  const labels = { up: "Move up", down: "Move down", remove: "Remove", ...options.labels };
  const render = options.render ?? ((item) => html`<code class="sa-unit">${item}</code>`);
  list.classList.add("sa-ordered");

  function draw() {
    list.innerHTML = items.length
      ? html`${items.map((item, i) => html`<li data-i="${i}">${render(item)}
          <span class="sa-toolbar__spacer"></span>
          ${iconButton("arrow-up", labels.up, { action: "up" })}${iconButton("arrow-down", labels.down, { action: "down" })}
          ${iconButton("close", labels.remove, { action: "remove", danger: true })}</li>`)}`
      : html`<li class="uk-text-muted sa-ordered__empty">${options.empty ?? "None."}</li>`;
  }

  function change(next) {
    items = next;
    draw();
    options.onChange?.(items);
  }

  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const i = Number(button.closest("li").dataset.i);
    const next = [...items];
    const action = button.dataset.action;
    if (action === "remove") next.splice(i, 1);
    if (action === "up" && i > 0) [next[i - 1], next[i]] = [next[i], next[i - 1]];
    if (action === "down" && i < next.length - 1) [next[i + 1], next[i]] = [next[i], next[i + 1]];
    change(next);
  });
  draw();

  return {
    items: () => [...items],
    set: (next) => change([...next]),
    add: (item) => change([...items, item]),
  };
}
