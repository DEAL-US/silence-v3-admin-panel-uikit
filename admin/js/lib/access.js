// Who can call an endpoint: the same words in the grid of Endpoints, its edit page and Try it.

export const anyRole = (e) => !e.allowed_roles?.length || e.allowed_roles.includes("*");

// The access to an endpoint, in four levels: Public, Logged in, Roles (only those roles) and Owner
// (each user only on its rows, also when reading; and, optionally, some roles on any row)
export const LEVELS = { public: "Public", logged: "Logged in", roles: "Roles", owner: "Owner" };
export const levelOf = (e) => (e.owner ? "owner" : !anyRole(e) ? "roles" : e.auth_required ? "logged" : "public");

/** Who can call an endpoint, in words */
export function whoCan(e) {
  const roles = anyRole(e) ? [] : e.allowed_roles;
  const level = levelOf(e);
  if (level === "public") return "Anyone, without a session";
  if (level === "logged") return "Any logged-in user";
  if (level === "roles") return `Logged-in users with the role ${roles.join(" or ")}`;
  const rows = e.method === "GET" ? " (it only sees those)" : e.method === "POST" ? " (the new row is its own)" : "";
  return `Each logged-in user, only on the rows whose ${e.owner} is its id${rows}`
    + (roles.length ? `; ${roles.join(" and ")}: on any row` : "");
}
