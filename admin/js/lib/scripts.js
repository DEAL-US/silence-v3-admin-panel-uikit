// The database that the scripts of sql/ create. The scripts of the course name it themselves
// (DROP DATABASE IF EXISTS grades_db; CREATE DATABASE grades_db; USE grades_db;), because they are
// also run in HeidiSQL; Silence drops and creates the database of silence.json and runs them, so
// if they name another one, they drop and fill that one. The database of a project is the one that
// its scripts create: if they name one, it must be the configured one (DEAL-US/Silence#24).
import { quietReadFile } from "./files.js";

// CREATE/DROP DATABASE|SCHEMA [IF [NOT] EXISTS] x, and USE x, at the start of a line
const NAMED = /^\s*(?:(?:CREATE|DROP)\s+(?:DATABASE|SCHEMA)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?|USE\s+)`?(\w+)`?/gim;

/** The databases that a script names (without its /* comments *\/; the -- ones never start a line) */
export function databasesIn(text) {
  const code = String(text ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  return [...new Set([...code.matchAll(NAMED)].map((m) => m[1]))];
}

/** The databases that some scripts of sql/ name: {names: [...], byFile: {file: [...]}} */
export async function scriptsDatabases(files) {
  const byFile = {};
  await Promise.all(files.map(async (f) => {
    const file = await quietReadFile(`sql/${f}`).catch(() => null);
    byFile[f] = databasesIn(file?.data);
  }));
  const names = [...new Map(Object.values(byFile).flat().map((n) => [n.toLowerCase(), n])).values()];
  return { names, byFile };
}

/** What is wrong with some scripts for a database (null: nothing): they name another one, or
 *  more than one */
export function scriptsProblem(names, database) {
  if (names.length > 1) return `The scripts name more than one database (${names.join(", ")}): they must create only one`;
  if (names.length === 1 && database && names[0].toLowerCase() !== String(database).toLowerCase()) {
    return `The scripts create ${names[0]}, and the project uses ${database}`;
  }
  return null;
}
