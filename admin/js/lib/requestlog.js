// The log of requests that Silence writes (admin/logs/requests.log, one line per request to the
// student's app) as the panel uses it: its lines for the activity, and their summary for the
// statistics. Without DOM: it can be tested.
//
//   2026-11-08T08:01:12 api GET /api/employees/3 200 4ms 312B /employees/$employeeId
//   time                group method path (and query) status time bytes route (- if none) [message]

const KINDS = { html: "page", htm: "page", css: "style", js: "script", mjs: "script", json: "data", png: "image",
  jpg: "image", jpeg: "image", gif: "image", svg: "image", webp: "image", ico: "image", woff: "font", woff2: "font",
  ttf: "font" };

/** The lines of the log: [{at (ms), group, method, path, status, ms, bytes, route, message}] */
export function parseLog(text) {
  const res = [];
  for (const line of String(text ?? "").split("\n")) {
    const f = line.split(" ");
    if (f.length < 8) continue;
    const at = new Date(f[0]).getTime();  // Local time, as Silence writes it
    const status = Number(f[4]);
    if (Number.isNaN(at) || Number.isNaN(status)) continue;
    res.push({ at, group: f[1], method: f[2], path: f[3], status, ms: parseInt(f[5], 10) || 0,
      bytes: parseInt(f[6], 10) || 0, route: f[7] === "-" ? null : f[7], message: f.slice(8).join(" ") });
  }
  return res;
}

const pathOnly = (path) => decodeURIComponent(path.split("?")[0]);

/** The kind of a file of the web app by its extension (a folder is its index.html) */
export function fileKind(path) {
  const last = path.split("/").pop();
  const ext = last.includes(".") ? last.split(".").pop().toLowerCase() : "html";
  return KINDS[ext] ?? "other";
}

function apiGroup() {
  return { requests: 0, errors: 0, totalMs: 0, byMethod: {}, byStatus: {}, endpoints: new Map(), unmatched: {} };
}

const inc = (o, k, n = 1) => {
  o[k] = (o[k] ?? 0) + n;
};

function apiReport(g) {
  const endpoints = [...g.endpoints.values()].map((e) => ({ method: e.method, route: e.route, requests: e.requests,
    errors: e.errors, byStatus: e.byStatus, avgMs: Math.round((e.totalMs / e.requests) * 10) / 10, maxMs: e.maxMs }))
    .sort((a, b) => b.requests - a.requests);
  return { requests: g.requests, errors: g.errors, avgMs: g.requests ? Math.round((g.totalMs / g.requests) * 10) / 10 : 0,
    byMethod: g.byMethod, byStatus: g.byStatus, endpoints, unmatched: g.unmatched };
}

/** The statistics of the lines: the student's API ("api", by endpoint), what Silence gives to the
 *  app ("silence": login, logout, the API summary) and the web app ("web", by file) */
export function summarize(lines) {
  const groups = { api: apiGroup(), silence: apiGroup() };
  const web = { requests: 0, notFound: 0, bytes: 0, byKind: {}, files: new Map() };
  for (const l of lines) {
    if (l.group === "web") {
      const path = pathOnly(l.path);
      const kind = fileKind(path);
      web.requests++;
      inc(web.byKind, kind);
      const f = web.files.get(path) ?? { path, kind, requests: 0, notFound: 0, bytes: 0 };
      web.files.set(path, f);
      f.requests++;
      if (l.status === 404) {
        web.notFound++;
        f.notFound++;
      } else {
        web.bytes += l.bytes;
        f.bytes += l.bytes;
      }
      continue;
    }
    const g = groups[l.group];
    if (!g) continue;
    g.requests++;
    g.totalMs += l.ms;
    inc(g.byMethod, l.method);
    inc(g.byStatus, String(l.status));
    if (l.status >= 400) g.errors++;
    if (!l.route) {
      inc(g.unmatched, `${l.method} ${pathOnly(l.path)}`);
      continue;
    }
    const key = `${l.method} ${l.route}`;
    const e = g.endpoints.get(key) ?? { method: l.method, route: l.route, requests: 0, errors: 0, totalMs: 0, maxMs: 0, byStatus: {} };
    g.endpoints.set(key, e);
    e.requests++;
    e.totalMs += l.ms;
    e.maxMs = Math.max(e.maxMs, l.ms);
    inc(e.byStatus, String(l.status));
    if (l.status >= 400) e.errors++;
  }
  return {
    since: lines.length ? lines[0].at : null,
    api: apiReport(groups.api),
    silence: apiReport(groups.silence),
    web: { requests: web.requests, notFound: web.notFound, bytes: web.bytes, byKind: web.byKind,
      files: [...web.files.values()].sort((a, b) => b.requests - a.requests) },
  };
}

/** The lines of the log that are not requests made by the panel (the panel logs those itself, with
 *  their details, or does not show them): the same method, path and status within two seconds.
 *  panelRequests: [{at, method, path (with the API prefix), status}] */
export function notFromPanel(lines, panelRequests) {
  const pending = panelRequests.map((r) => ({ ...r, used: false }));
  return lines.filter((l) => {
    const twin = pending.find((r) => !r.used && r.method === l.method && r.status === l.status
      && Math.abs(r.at - l.at) < 2000 && r.path === decodeURIComponent(l.path));
    if (twin) twin.used = true;
    return !twin;
  });
}
