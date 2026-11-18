// Trying an endpoint (#/endpoints/try/<file>/<name>): as the user chosen at the bottom of the sidebar
// (a session without password), with real values proposed by a GET of the same table, and its response.
import { html, pageHead, link, methodBadge, statusClass, json, options } from "../lib/html.js";
import { loadEndpoints } from "../lib/api.js";
import { session, callApi, peekApi, studentApi } from "../lib/student-api.js";
import { attempt, toast } from "../lib/ui.js";
import { whoCan } from "../lib/access.js";

/** Rows of the endpoint's table, to propose real values: from a GET of the student's API on the
 *  same table without params (e.g., GET /departments). [] if there is none. */
async function sampleRows(e, endpoints) {
  const list = endpoints.find((x) => x.method === "GET" && x.table === e.table && !x.route.includes("$"));
  if (!list) return { rows: [], from: null };
  try {
    const data = await peekApi(list.route);
    return { rows: Array.isArray(data) ? data.filter((r) => r && typeof r === "object").slice(0, 100) : [], from: list.route };
  } catch {
    return { rows: [], from: list.route };
  }
}

/** The value of a row for a param (same name, ignoring case) */
function valueFor(row, param) {
  const key = Object.keys(row).find((k) => k.toLowerCase() === param.toLowerCase());
  return key === undefined ? undefined : row[key];
}

const rowLabel = (r) => Object.values(r).filter((v) => v !== null && typeof v !== "object").slice(0, 3).join(" · ");

export async function render(main, app, file, name) {
  const data = await attempt(() => loadEndpoints({ quiet: true }));
  if (!data) return;
  const e = data.endpoints.find((x) => x.file === file && x.name === name);
  if (!e) {
    main.innerHTML = html`<div class="uk-alert uk-alert-danger">There is no endpoint ${name} in ${file}.json.</div>`;
    return;
  }
  const prefix = studentApi.prefix;
  const params = [...e.route.matchAll(/\$(\w+)/g)].map((m) => m[1]);
  const bodyParams = e.method === "POST" || e.method === "PUT" ? e.request_body_params ?? [] : [];
  const linked = app.status.auth.linked;
  const sample = await sampleRows(e, data.endpoints);
  const pwd = linked ? app.status.auth.password?.toLowerCase() : null;

  main.innerHTML = html`
    ${pageHead(html`${methodBadge(e.method)} <span class="sa-route">${prefix + e.route}</span>`)}
    <p class="uk-text-muted">${e.description ? `${e.description} · ` : ""}${whoCan(e)}</p>
    <p id="try-as"></p>
    <form id="try-form">
      <div class="sa-form">
        ${sample.rows.length && (params.length || bodyParams.length) ? html`<div class="sa-field sa-span">
          <label class="uk-form-label" for="try-row">Fill with the data of a row
            <span class="uk-text-muted">(from GET ${prefix + sample.from})</span></label>
          <select class="uk-select" id="try-row">${options(sample.rows.map((r, i) => [i, rowLabel(r)]), "", "—")}</select></div>` : ""}
      </div>
      <div class="sa-form">
        ${params.map((p) => {
          const values = [...new Set(sample.rows.map((r) => valueFor(r, p)).filter((v) => v !== undefined && v !== null))];
          return html`<div class="sa-field"><label class="uk-form-label" for="try-${p}">$${p}</label>
            <input class="uk-input" id="try-${p}" name="${p}" required list="try-${p}-values"
              placeholder="${values.length ? `e.g. ${values[0]}` : ""}">
            <datalist id="try-${p}-values">${values.map((v) => html`<option value="${v}">`)}</datalist></div>`;
        })}
        ${(e.query_params ?? []).map((p) => html`<div class="sa-field"><label class="uk-form-label" for="try-q-${p}">${p}
          <span class="uk-text-muted">(query string)</span></label>
          <input class="uk-input" id="try-q-${p}" name="__q:${p}" required></div>`)}
        ${e.method === "GET" ? html`<div class="sa-field"><label class="uk-form-label" for="try-query">Query string</label>
          <input class="uk-input" id="try-query" name="__query" placeholder="_sort=name&_limit=5"></div>` : ""}
      </div>
      ${bodyParams.length ? html`<div class="sa-field"><label class="uk-form-label" for="try-body">Body (JSON)</label>
        <textarea class="uk-textarea sa-code" id="try-body" name="__body">${JSON.stringify(
          Object.fromEntries(bodyParams.map((p) => [p, ""])), null, 2)}</textarea></div>` : ""}
      <div class="sa-toolbar"><button class="uk-button uk-button-primary" type="submit">Send ${e.method}</button></div>
    </form>
    <div id="try-result" role="status"></div>`;

  const form = main.querySelector("#try-form");
  // Who it is sent as: chosen at the bottom of the sidebar
  const showAs = () => {
    const box = main.querySelector("#try-as");
    if (!box) return document.removeEventListener("sa-session", showAs);  // Another page
    const who = session.get();
    box.innerHTML = linked ? html`Sent as <strong>${who ? who.label : "nobody (without a session)"}</strong>` : "";
  };
  document.addEventListener("sa-session", showAs);
  showAs();
  form.querySelector("#try-row")?.addEventListener("change", (event) => {
    const row = sample.rows[Number(event.target.value)];
    if (!row) return;
    for (const p of params) {
      const v = valueFor(row, p);
      if (v !== undefined && v !== null) form.querySelector(`#try-${CSS.escape(p)}`).value = v;
    }
    const body = form.querySelector("#try-body");
    if (body) {
      // In argon2 mode the API does not send the password: then it is left out (with it empty, a PUT
      // would change it); in plain mode it comes with the row
      const hidden = app.status.auth.password_mode === "plain" ? null : pwd;
      body.value = JSON.stringify(Object.fromEntries(bodyParams.filter((p) => p.toLowerCase() !== hidden)
        .map((p) => [p, valueFor(row, p) ?? ""])), null, 2);
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const v = Object.fromEntries(new FormData(form));
    let path = e.route;
    for (const p of params) path = path.replace("$" + p, encodeURIComponent(v[p]));
    const query = [new URLSearchParams(Object.fromEntries((e.query_params ?? []).map((p) => [p, v[`__q:${p}`]]))).toString(),
      (v.__query ?? "").replace(/^\?/, "")].filter(Boolean).join("&");
    if (query) path += `?${query}`;
    let body;
    if (v.__body?.trim()) {
      try {
        body = JSON.parse(v.__body);
      } catch {
        toast("The body is not valid JSON", "error");
        return;
      }
    }
    const res = await callApi(e.method, path, body, { href: link("endpoints", "try", e.file, e.name) });
    main.querySelector("#try-result").innerHTML = html`
      <p><span class="sa-status ${statusClass(res.status)}">${res.status}</span>
        <span class="uk-text-muted">${e.method} ${prefix + path} · ${res.ms} ms
        ${Array.isArray(res.data) ? ` · ${res.data.length} rows` : ""}</span></p>
      <pre class="sa-pre">${json(res.data)}</pre>`;
  });
}
