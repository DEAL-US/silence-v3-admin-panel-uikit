// Helpers shared by the pages of the admin panel. UIkit (global) gives the notifications.
/* global UIkit */
import { logRequest } from "./components/console.js";

/** The admin API of Silence that this panel uses (see panel.json). */
export const API = "/_silence/v1";

/** Calls the admin API and returns its JSON, or throws an Error with its message.
 *  etag: the version of the file that is changed (If-Match), so as not to overwrite
 *  changes made meanwhile in another place (412). */
export async function api(path, method = "GET", body = undefined, etag = undefined) {
  const options = { method, headers: {} };
  if (etag !== undefined) {
    options.headers["If-Match"] = etag;
  }
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const response = await fetch(API + path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Error ${response.status}`);
  }
  return data;
}

/** Escapes a value to put it in HTML. */
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

const STATUS = { info: "primary", success: "success", warning: "warning", error: "danger" };

export function toast(message, type = "info") {
  UIkit.notification({
    message: esc(message),
    status: STATUS[type] ?? "primary",
    pos: "top-right",
    timeout: type === "error" ? 8000 : 4000,
  });
}

/** Runs an async action showing its error (if any) in a notification. */
export async function attempt(action, success) {
  try {
    const res = await action();
    if (success) {
      toast(success, "success");
    }
    return res;
  } catch (error) {
    toast(error.message, "error");
    return undefined;
  }
}

/** Confirmation without a modal window: the first click changes the button's text, and only
 *  a second click within 4 seconds confirms. Returns true when the action must go ahead. */
export function needsConfirm(button, label = "Click again to confirm") {
  if (button.dataset.armed) {
    delete button.dataset.armed;
    return true;
  }
  const original = button.innerHTML;
  button.dataset.armed = "1";
  button.innerHTML = esc(label);
  button.classList.add("sa-armed");
  setTimeout(() => {
    if (button.dataset.armed) {
      delete button.dataset.armed;
      button.innerHTML = original;
      button.classList.remove("sa-armed");
    }
  }, 4000);
  return false;
}

/** Whether the page has unsaved changes (then it is not re-rendered when the files change). */
export function editing(main, value) {
  if (value === undefined) {
    return main.dataset.editing === "1";
  }
  if (value) {
    main.dataset.editing = "1";
  } else {
    delete main.dataset.editing;
  }
  return value;
}

/** A link inside the panel (#/...), with its parts encoded. */
export function link(...parts) {
  return "#/" + parts.map((p) => encodeURIComponent(p)).join("/");
}

/** A small icon button for the actions of a grid row: a link (href) or a button (action). */
export function iconButton(icon, title, { href, action, danger = false } = {}) {
  const cls = `uk-icon-button sa-icon-button${danger ? " sa-icon-button--danger" : ""}`;
  return href
    ? `<a class="${cls}" href="${esc(href)}" uk-icon="icon: ${icon}; ratio: .8" title="${esc(title)}" aria-label="${esc(title)}"></a>`
    : `<button class="${cls}" type="button" data-action="${esc(action)}" uk-icon="icon: ${icon}; ratio: .8" title="${esc(title)}" aria-label="${esc(title)}"></button>`;
}

export function method(m) {
  return `<span class="sa-method sa-method--${esc(m)}">${esc(m)}</span>`;
}

export function source(s) {
  return s === "auto" ? `<span class="uk-label sa-label-auto">auto</span>` : `<span class="uk-label">custom</span>`;
}

export function statusClass(code) {
  if (code < 400) return "sa-status--ok";
  if (code < 500) return "sa-status--client";
  return "sa-status--server";
}

export function json(value) {
  return esc(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

// The user that the panel acts as when trying endpoints (its session token).
export const session = {
  get() {
    try {
      return JSON.parse(sessionStorage.getItem("silence-admin-session"));
    } catch {
      return null;
    }
  },
  set(value) {
    try {
      if (value) {
        sessionStorage.setItem("silence-admin-session", JSON.stringify(value));
      } else {
        sessionStorage.removeItem("silence-admin-session");
      }
    } catch {
      // Storage blocked: the session is not remembered
    }
    document.dispatchEvent(new CustomEvent("sa-session"));
  },
};

// How to call the student's API, as the admin API says in GET / (studentApi)
export const studentApi = { prefix: "/api", sessionHeader: "Token" };

/** Sends a request to the project's API, as the current session or the given token, and logs it
 *  in the console. source: who sends it ("Try", "Composite …"); expect(status, data): whether it
 *  went as expected (by default, a status below 400) */
export async function callApi(prefix, methodName, path, body, { source = "Try", token, expect } = {}) {
  const options = { method: methodName, headers: {} };
  const current = token === undefined ? session.get()?.token : token;
  if (current) {
    options.headers[studentApi.sessionHeader] = current;
  }
  if (body !== undefined && body !== null && methodName !== "GET" && methodName !== "DELETE") {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const started = performance.now();
  let status = 0;
  let data = null;
  try {
    const response = await fetch(prefix + path, options);
    status = response.status;
    const text = await response.text();
    data = text;
    try {
      data = JSON.parse(text);
    } catch {
      // Not JSON
    }
  } catch (error) {
    data = error.message;
  }
  const ms = Math.round(performance.now() - started);
  const ok = expect ? expect(status, data) : status > 0 && status < 400;
  logRequest({ source, method: methodName, path: prefix + path, status, ms, ok, response: data,
    message: status >= 400 && data && typeof data === "object" ? data.message : "" });
  return { status, data, ms };
}
