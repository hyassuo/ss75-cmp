// Post-login destination from ?next=, restricted to this app's own paths:
// a single leading "/" (not "//host" or "/\\host", which browsers treat as
// another origin) and no scheme — so a crafted link can't turn the login
// into an open redirect.
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/dashboard";
  }
  if (/[\r\n]/.test(raw) || /^\/[a-z][a-z0-9+.-]*:/i.test(raw)) return "/dashboard";
  if (raw.startsWith("/login")) return "/dashboard";
  return raw;
}
