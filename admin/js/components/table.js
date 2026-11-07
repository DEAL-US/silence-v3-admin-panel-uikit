// The grid of every list of the panel: sorted by clicking a header, with a row of filters under
// the headers (text, or a list of the values for fixed values).
import { html } from "../lib/html.js";

/**
 * Builds a grid inside container and returns {update(rows), rows(), visible(), filtering()}.
 *
 * options.columns: [{
 *   key,                      // unique name of the column
 *   label,                    // header text
 *   value: (row) => any,      // value to sort and filter by (default: row[key])
 *   render: (row) => html,    // cell (html`...`; default: the value as text)
 *   filter: "text" | "select" | false   (default "text")
 *   sortable: true | false    (default true)
 *   className                 // CSS class of the cells
 * }]
 * options.rows: the data
 * options.sort: {key, dir: "asc" | "desc"} initial order
 * options.empty: what to say when there are no rows (a text or html`...`, e.g., with the next step)
 * options.onAction: (action, row, element) => {}  for the elements with data-action in the cells
 * options.after: (row) => html | ""   an extra row under a row (e.g., details)
 */
export function dataTable(container, options) {
  const columns = options.columns.map((c) => ({
    filter: "text", sortable: true, value: (row) => row[c.key], render: null, ...c,
  }));
  let rows = options.rows ?? [];
  let sort = options.sort ?? null;
  const filters = {};

  const valueOf = (col, row) => col.value(row) ?? "";

  container.innerHTML = html`
    <div class="uk-overflow-auto">
      <table class="uk-table uk-table-divider uk-table-small uk-table-hover sa-table">
        <thead>
          <tr class="sa-table__headers"></tr>
          <tr class="sa-table__filters"></tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
    <p class="sa-small uk-text-muted sa-table__count"></p>`;
  const headRow = container.querySelector(".sa-table__headers");
  const filterRow = container.querySelector(".sa-table__filters");
  const tbody = container.querySelector("tbody");
  const count = container.querySelector(".sa-table__count");

  function drawHeaders() {
    headRow.innerHTML = html`${columns.map((c) => {
      if (!c.sortable) return html`<th>${c.label}</th>`;
      const active = sort?.key === c.key;
      const dir = active ? (sort.dir === "asc" ? "ascending" : "descending") : "none";
      return html`<th aria-sort="${dir}"><button type="button" class="sa-sort" data-sort="${c.key}">${c.label}
        <span class="sa-sort__arrow">${active ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span></button></th>`;
    })}`;
  }

  function drawFilters() {
    filterRow.innerHTML = html`${columns.map((c) => {
      if (c.filter === "select") {
        const values = [...new Set(rows.map((r) => String(valueOf(c, r))))].sort();
        return html`<th><select class="uk-select uk-form-small" data-filter="${c.key}" aria-label="Filter by ${c.label}">
          <option value="">All</option>
          ${values.map((v) => html`<option value="${v}" ${filters[c.key] === v ? "selected" : ""}>${v || "—"}</option>`)}
        </select></th>`;
      }
      if (c.filter === "text") {
        return html`<th><input class="uk-input uk-form-small" data-filter="${c.key}" value="${filters[c.key] ?? ""}"
          placeholder="Filter" aria-label="Filter by ${c.label}"></th>`;
      }
      return html`<th></th>`;
    })}`;
  }

  function visibleRows() {
    let res = rows.filter((row) => columns.every((c) => {
      const f = filters[c.key];
      if (!f) return true;
      const v = String(valueOf(c, row));
      return c.filter === "select" ? v === f : v.toLowerCase().includes(f.toLowerCase());
    }));
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const factor = sort.dir === "asc" ? 1 : -1;
      res = [...res].sort((a, b) => {
        const x = valueOf(col, a);
        const y = valueOf(col, b);
        if (typeof x === "number" && typeof y === "number") return (x - y) * factor;
        return String(x).localeCompare(String(y), undefined, { numeric: true }) * factor;
      });
    }
    return res;
  }

  function drawBody() {
    const visible = visibleRows();
    if (!visible.length) {
      const empty = rows.length ? "No rows match the filters." : options.empty ?? "No rows.";
      tbody.innerHTML = html`<tr><td colspan="${columns.length}" class="uk-text-muted sa-table__empty">${empty}</td></tr>`;
    } else {
      tbody.innerHTML = html`${visible.map((row) => {
        const i = rows.indexOf(row);
        const extra = options.after ? options.after(row) : "";
        return html`<tr data-row="${i}">${columns.map((c) =>
          html`<td class="${c.className ?? ""}">${c.render ? c.render(row) : valueOf(c, row)}</td>`)}</tr>
          ${extra ? html`<tr class="sa-table__extra" data-row="${i}"><td colspan="${columns.length}">${extra}</td></tr>` : ""}`;
      })}`;
    }
    count.textContent = visible.length === rows.length ? `${rows.length} rows` : `${visible.length} of ${rows.length} rows`;
  }

  headRow.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sort]");
    if (!button) return;
    const key = button.dataset.sort;
    sort = sort?.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" };
    drawHeaders();
    drawBody();
  });
  filterRow.addEventListener("input", (event) => {
    const field = event.target.closest("[data-filter]");
    if (!field) return;
    filters[field.dataset.filter] = field.value;
    drawBody();
  });
  tbody.addEventListener("click", (event) => {
    const el = event.target.closest("[data-action]");
    if (!el || !options.onAction) return;
    options.onAction(el.dataset.action, rows[Number(el.closest("tr[data-row]").dataset.row)], el);
  });

  drawHeaders();
  drawFilters();
  drawBody();

  return {
    /** New rows (the order and the filters are kept) */
    update(newRows) {
      rows = newRows;
      drawFilters();
      drawBody();
    },
    rows: () => rows,
    /** The rows that the filters let through, in the order shown */
    visible: () => visibleRows(),
    /** Whether a filter is being used (e.g., not to refresh the grid while typing) */
    filtering: () => Object.values(filters).some(Boolean),
  };
}
