import type { CookieOptions } from "@supabase/ssr";

// Options for the Supabase session cookies the server writes.
//  - Session-only (the session-policy decision): maxAge/expires are
//    dropped so the cookie ends when the browser closes, except on a
//    deletion (maxAge 0 / a past date), which must stay a deletion.
//  - Secure when the request came over https (production). Not on plain
//    http (the E2E stack on http://localhost): a Secure cookie must not
//    depend on the browser treating localhost as a secure origin.
export function sessionCookieOptions(options: CookieOptions, secure: boolean): CookieOptions {
  const o = { ...options };
  const deleting =
    (typeof o.maxAge === "number" && o.maxAge <= 0) ||
    (o.expires !== undefined && new Date(o.expires).getTime() <= Date.now());
  if (!deleting) {
    delete o.maxAge;
    delete o.expires;
  }
  if (secure) o.secure = true;
  return o;
}

/** The original request was https (Vercel and most proxies say so in
 *  x-forwarded-proto; the URL itself may already be the inner http one). */
export function requestIsHttps(url: string | URL | null, headers: Headers): boolean {
  const proto = (headers.get("x-forwarded-proto") ?? "").split(",")[0]?.trim();
  if (proto) return proto === "https";
  try {
    return url !== null && new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}
