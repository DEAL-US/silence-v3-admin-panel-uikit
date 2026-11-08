// The files of the project, through Silence's file API (/files): silence.json, endpoints/*.json,
// tests/*.json and the log of requests. Silence checks each
// one before saving it; the panel reads it, changes what it has to and writes it whole, with the
// version it read (412 if it changed meanwhile in another place).
import { api, quietApi } from "./api.js";

export const CONFIG = "silence.json";
export const LOG = "admin/logs/requests.log";
export const endpointsFile = (file) => `endpoints/${file}.json`;
export const testsFile = (file) => `tests/${file}.json`;

const url = (path) => `/files/${path.split("/").map(encodeURIComponent).join("/")}`;

/** A file: {data, etag} (data null if it does not exist) */
export const readFile = (path) => api(url(path));
export const quietReadFile = (path) => quietApi(url(path));

/** Writes a file whole. action: what it means, for the activity (see activity.js) */
export const writeFile = (path, data, etag, action) => api(url(path), "PUT", data, etag, { action });

export const deleteFile = (path, etag, action) => api(url(path), "DELETE", undefined, etag, { action });

/** The files of a folder of the project: [{path, etag}] */
export const listFiles = async (dir) => (await quietApi(`/files?dir=${encodeURIComponent(dir)}`)).files;

/** silence.json (without its secret key) */
export async function readConfig() {
  const { data, etag } = await readFile(CONFIG);
  return { config: data, etag };
}

/** Changes some values of a section of silence.json (server, database, auth, js_api) or debug
 *  ({debug: true}). It returns what Silence answered ({etag, restartNeeded}) */
export async function saveConfig(section, values) {
  const { data, etag } = await quietReadFile(CONFIG);
  const config = section === "debug" ? { ...data, debug: values.debug } : { ...data, [section]: { ...data[section], ...values } };
  return writeFile(CONFIG, config, etag, { section, values });
}

/** Saves an entry (an endpoint or a test, by name) in its file. replaces: the name it had in the
 *  same file, if it is renamed (it keeps its place) */
export async function saveEntry(path, name, definition, replaces = null) {
  const { data, etag } = await quietReadFile(path);
  const content = {};
  let placed = false;
  for (const [key, value] of Object.entries(data ?? {})) {
    if (key === name || key === replaces) {
      if (!placed) content[name] = definition;
      placed = true;
    } else {
      content[key] = value;
    }
  }
  if (!placed) content[name] = definition;
  return writeFile(path, content, etag, { name, change: "saved" });
}

/** Deletes an entry of its file (and the file, if it was the last one) */
export async function deleteEntry(path, name) {
  const { data, etag } = await quietReadFile(path);
  if (!data || !(name in data)) throw new Error(`There is no '${name}' in ${path}`);
  const { [name]: _removed, ...rest } = data;
  const action = { name, change: "deleted" };
  return Object.keys(rest).length ? writeFile(path, rest, etag, action) : deleteFile(path, etag, action);
}

/** The names that are free in a file: name, or name_custom, name_custom2… if it is taken */
export async function freeName(path, name) {
  const { data } = await quietReadFile(path);
  if (!data || !(name in data)) return name;
  for (let i = 1; ; i++) {
    const candidate = `${name}_custom${i > 1 ? i : ""}`;
    if (!(candidate in data)) return candidate;
  }
}

/** Saves an entry that may come from another place (old: {path, name, definition}, or null if it
 *  is new): renamed in its file, it keeps its place; moved to another file, it is removed from
 *  the old one first (Silence rejects the same name, or the same route, in two files) and put
 *  back there if the new file does not accept it */
export async function moveEntry(old, path, name, definition) {
  if (!old || old.path === path) return saveEntry(path, name, definition, old?.name ?? null);
  await deleteEntry(old.path, old.name);
  try {
    return await saveEntry(path, name, definition);
  } catch (err) {
    await saveEntry(old.path, old.name, old.definition).catch(() => null);
    throw err;
  }
}
