// Helpers shared by the pages of the admin panel. UIkit (global) gives the modal
// dialog and the notifications.
/* global UIkit */

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
    pos: "bottom-right",
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

/** Opens the dialog with some HTML; resolves to the form's values, or null if cancelled. */
export function dialog(title, html, okText = "OK") {
  const element = document.querySelector("#dialog");
  const form = element.querySelector("#dialog-form");
  element.querySelector("#dialog-title").textContent = title;
  element.querySelector("#dialog-body").innerHTML = html;
  element.querySelector("#dialog-ok").textContent = okText;
  const modal = UIkit.modal(element);

  return new Promise((resolve) => {
    let values = null;
    function submit(event) {
      event.preventDefault();
      values = {};
      for (const field of form.querySelectorAll("[name]")) {
        values[field.name] = field.type === "checkbox" ? field.checked : field.value;
      }
      modal.hide();
    }
    function hidden(event) {
      if (event.target !== element) return;  // Ignore the events of other components inside
      form.removeEventListener("submit", submit);
      UIkit.util.off(element, "hidden", hidden);
      resolve(values);
    }
    form.addEventListener("submit", submit);
    UIkit.util.on(element, "hidden", hidden);
    modal.show();
  });
}

export function dialogOpen() {
  return document.querySelector("#dialog").classList.contains("uk-open");
}

export async function confirmAction(title, text, okText = "Continue") {
  return (await dialog(title, `<p>${esc(text)}</p>`, okText)) !== null;
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

/** Sends a request to the project's API, as the current session (if any). */
export async function callApi(prefix, methodName, path, body) {
  const options = { method: methodName, headers: {} };
  const current = session.get();
  if (current) {
    options.headers.Token = current.token;
  }
  if (body !== undefined && body !== null && methodName !== "GET" && methodName !== "DELETE") {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const started = performance.now();
  const response = await fetch(prefix + path, options);
  const text = await response.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    // Not JSON
  }
  return { status: response.status, data, ms: Math.round(performance.now() - started) };
}
