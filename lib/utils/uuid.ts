// User and item ids arrive in request bodies as strings. Postgres accepts a
// UUID in any letter case, but the app compares ids as strings (e.g. "is
// this the signed-in admin?"), so an upper-case copy of one's own id must
// not slip past such a check. Canonical form = 8-4-4-4-12 hex, lower case.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The id in canonical (lower-case) form, or null if it isn't a UUID. */
export function canonicalUuid(value: unknown): string | null {
  if (typeof value !== "string" || !UUID.test(value)) return null;
  return value.toLowerCase();
}
