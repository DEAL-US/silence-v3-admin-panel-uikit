// Behaviour shared by the pages: notifications, confirmations without modal windows and the
// reload of the database. UIkit (global) gives the notifications.
/* global UIkit */
import { api } from "./api.js";
import { esc } from "./html.js";

const STATUS = { info: "primary", success: "success", warning: "warning", error: "danger" };

/** A notification, also said to the screen readers (#announce) */
export function toast(message, type = "info") {
  const announce = document.querySelector("#announce");
  if (announce) announce.textContent = message;
  UIkit.notification({
    message: esc(message),
    status: STATUS[type] ?? "primary",
    pos: "top-right",
    timeout: type === "error" ? 8000 : 4000,
  });
}

/** Runs an async action showing its error (if any) in a notification. Returns its result, or
 *  undefined if it failed. success: the notification when it works. */
export async function attempt(action, success) {
  try {
    const res = await action();
    if (success) toast(success, "success");
    return res;
  } catch (error) {
    toast(error.message, "error");
    return undefined;
  }
}

/** Confirmation without a modal window: the first click changes the button's text, and only a
 *  second click within 4 seconds confirms. Returns true when the action must go ahead. */
export function needsConfirm(button, label = "Click again to confirm") {
  const restore = () => {
    delete button.dataset.armed;
    button.innerHTML = button.saOriginal;
    button.classList.remove("sa-armed");
  };
  if (button.dataset.armed) {
    restore();
    return true;
  }
  button.saOriginal = button.innerHTML;
  button.dataset.armed = "1";
  button.textContent = label;
  button.classList.add("sa-armed");
  setTimeout(() => button.dataset.armed && restore(), 4000);
  return false;
}

/** Creates the database again with the scripts of silence.json (database.scripts), after a
 *  confirmation (a second click). Returns true if it was done. */
export async function reloadDatabase(button, scripts) {
  if (!scripts?.length) {
    toast("Choose the scripts of sql/ that create the database first, in Overview → Advanced", "error");
    return false;
  }
  if (!needsConfirm(button, "Drop and create it again?")) return false;
  button.disabled = true;
  const res = await attempt(() => api("/database/reload", "POST"));
  button.disabled = false;
  if (res) toast(`Database created again: ${res.scripts.map((x) => x.file).join(", ")}`, "success");
  return Boolean(res);
}
