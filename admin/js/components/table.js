// A table component shared by every page of the panel: sorting by clicking a column header
// and a row of filters under the headers (text, or a list of the values for fixed values).
import { esc } from "../ui.js";

/**
 * Builds a table inside container and returns {update(rows), rows()}.
 *
 * options.columns: [{
 *   key,                      // unique name of the column
 *   label,                    // header text
 *   value: (row) => any,      // value to sort and filter by (default: row[key])
 *   render: (row) => html,    // cell HTML (default: the escaped value)
 *   filter: "text" | "select" | false   (default "text")
 *   sortable: true | false    (default true)
 *   className                 // CSS class of the cells
 * }]
 * options.rows: the data
 * options.sort: {key, dir: "asc" | "desc"} initial order
 * options.empty: text when there are no rows
 * options.onAction: (action, row, element) => {}  for the elements with data-action in the cells
 * options.after: (row) => html | ""   an extra row under a row (e.g., details)
 */
export function dataTable(container, options) {
  const columns = options.columns.map((c) => ({
    filter: "text", sortable: true, value: (row) => row[c.key],
    render: null, ...c,
  }));
  let rows = options.rows ?? [];
  let sort = options.sort ?? null;
  const filters = {};

  const valueOf = (col, row) => {
    const v = col.value(row);
    return v === null || v === undefined ? "" : v;
  };

  container.innerHTML = `
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
    headRow.innerHTML = columns.map((c) => {
      if (!c.sortable) {
        return `<th>${esc(c.label)}</th>`;
      }
      const active = sort?.key === c.key;
      const arrow = active ? (sort.dir === "asc" ? "▲" : "▼") : "";
      return `<th aria-sort="${active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}">
        <button type="button" class="sa-sort" data-sort="${esc(c.key)}">${esc(c.label)} <span class="sa-sort__arrow">${arrow}</span></button></th>`;
    }).join("");
  }

  function drawFilters() {
    filterRow.innerHTML = columns.map((c) => {
      if (c.filter === "select") {
        const values = [...new Set(rows.map((r) => String(valueOf(c, r))))].sort();
        return `<th><select class="uk-select uk-form-small" data-filter="${esc(c.key)}" aria-label="Filter by ${esc(c.label)}">
          <option value="">All</option>${values.map((v) =>
            `<option ${filters[c.key] === v ? "selected" : ""} value="${esc(v)}">${esc(v || "—")}</option>`).join("")}
        </select></th>`;
      }
      if (c.filter === "text") {
        return `<th><input class="uk-input uk-form-small" data-filter="${esc(c.key)}" value="${esc(filters[c.key] ?? "")}"
          placeholder="Filter" aria-label="Filter by ${esc(c.label)}"></th>`;
      }
      return "<th></th>";
    }).join("");
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
      tbody.innerHTML = `<tr><td colspan="${columns.length}" class="uk-text-muted">${esc(rows.length ? "No rows match the filters." : options.empty ?? "No rows.")}</td></tr>`;
    } else {
      tbody.innerHTML = visible.map((row) => {
        const i = rows.indexOf(row);
        const cells = columns.map((c) =>
          `<td class="${esc(c.className ?? "")}">${c.render ? c.render(row) : esc(valueOf(c, row))}</td>`).join("");
        const extra = options.after ? options.after(row) : "";
        return `<tr data-row="${i}">${cells}</tr>` +
          (extra ? `<tr class="sa-table__extra" data-row="${i}"><td colspan="${columns.length}">${extra}</td></tr>` : "");
      }).join("");
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
    const tr = el.closest("tr[data-row]");
    options.onAction(el.dataset.action, rows[Number(tr.dataset.row)], el);
  });

  drawHeaders();
  drawFilters();
  drawBody();

  return {
    update(newRows) {
      rows = newRows;
      drawFilters();
      drawBody();
    },
    rows: () => rows,
  };
}
