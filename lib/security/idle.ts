// Idle sign-out, shared by the browser (components/layout/SessionGuards.tsx)
// and the server (lib/supabase/proxy.ts, app/api/session/activity).
//
// The browser signs out after IDLE_TIMEOUT_MS without input. Its clock
// lives in localStorage (per user), so closing the tab and opening the app
// again within the browser session doesn't start a fresh 30 minutes.
//
// The server keeps its own view in an HttpOnly, session-only cookie
// (LAST_SEEN_COOKIE: "<session id>.<ms>"), refreshed by every signed-in
// page request and by the browser's activity ping (at most every
// ACTIVITY_PING_MS while the user is active, so filling a long form
// without navigating still counts). A session whose last-seen time is
// older than the idle limit is signed out on the server (refresh token
// revoked) and sent to /login?reason=idle. The browser's last activity
// may be up to one ping interval newer than the server's view, so the
// server allows that much on top of the same limit.
//
// No cookie for this session (just signed in, a reset link, a browser
// restart that kept the Supabase cookies) is judged by when the session
// was created: the newest "amr" timestamp of its access token, which
// GoTrue sets at sign-in and keeps across refreshes. Recent: a new
// session, the cookie starts now. Old: the session sat unseen for longer
// than the limit, and is signed out.

/** No input for this long signs the user out. */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
/** Heads-up shown this long before the idle sign-out. */
export const IDLE_WARNING_MS = 2 * 60 * 1000;
/** The browser tells the server about activity at most this often. */
export const ACTIVITY_PING_MS = 60 * 1000;
/** What the server allows between two signs of life. */
export const SERVER_IDLE_LIMIT_MS = IDLE_TIMEOUT_MS + ACTIVITY_PING_MS;

export const LAST_SEEN_COOKIE = "ss75-cmp.last-seen";
/** /login?reason=idle shows "signed out after inactivity". */
export const IDLE_REASON = "idle";
export const ACTIVITY_PATH = "/api/session/activity";
/** The activity ping's 401 body when the session went idle (the only
 *  answer on which the browser signs out). */
export const IDLE_EXPIRED_ERROR = "Session expired";

// ------------------------------------------------------------------ server

export interface LastSeen {
  sid: string;
  t: number;
}

export function parseLastSeen(v: string | null | undefined): LastSeen | null {
  const m = /^([A-Za-z0-9-]{1,64})\.(\d{1,15})$/.exec(v ?? "");
  return m ? { sid: m[1], t: Number(m[2]) } : null;
}

export function formatLastSeen(sid: string, t: number): string {
  return `${sid}.${Math.floor(t)}`;
}

/** The session this access token belongs to (GoTrue's session_id claim;
 *  the user id for a token without one). */
export function sessionKey(claims: Record<string, unknown>): string {
  const v = typeof claims.session_id === "string" ? claims.session_id : claims.sub;
  return typeof v === "string" && /^[A-Za-z0-9-]{1,64}$/.test(v) ? v : "none";
}

/** When the session was created (ms): its newest amr timestamp. */
export function sessionStart(claims: Record<string, unknown>): number | null {
  if (!Array.isArray(claims.amr)) return null;
  let best: number | null = null;
  for (const e of claims.amr) {
    const ts = e && typeof e === "object" ? (e as { timestamp?: unknown }).timestamp : null;
    if (typeof ts === "number" && (best === null || ts > best)) best = ts;
  }
  return best === null ? null : best * 1000;
}

/**
 * "ok" (keep going, refresh the cookie) or "expired" (sign out).
 * A cookie dated in the future (clock games) counts as no cookie.
 * Without the cookie and without an amr timestamp (not what GoTrue
 * issues) the session is let through: failing closed there would sign
 * every new session out.
 */
export function idleVerdict(
  cookie: LastSeen | null,
  claims: Record<string, unknown>,
  now: number
): "ok" | "expired" {
  const usable = cookie && cookie.sid === sessionKey(claims) && cookie.t <= now + 60_000;
  if (usable) return now - cookie.t > SERVER_IDLE_LIMIT_MS ? "expired" : "ok";
  const start = sessionStart(claims);
  if (start === null) return "ok";
  return now - start > SERVER_IDLE_LIMIT_MS ? "expired" : "ok";
}

/** Cheap pre-check without verifying anything (prefetch shortcut). */
export function lastSeenRecent(v: string | null | undefined, now: number): boolean {
  const c = parseLastSeen(v);
  return !!c && c.t <= now + 60_000 && now - c.t <= SERVER_IDLE_LIMIT_MS;
}

/** Options of the last-seen cookie: no maxAge/expires (ends with the
 *  browser), HttpOnly, Secure over https, SameSite=Lax. */
export function lastSeenCookieOptions(secure: boolean) {
  return { path: "/", httpOnly: true, sameSite: "lax" as const, secure };
}

// ----------------------------------------------------------------- browser

/** localStorage key; other tabs see changes through "storage" events. */
export const LAST_ACTIVITY_KEY = "ss75-cmp.lastActivity";

/** The user's last activity in this browser (any tab), or null. */
export function readLastActivity(userId: string): number | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(LAST_ACTIVITY_KEY) ?? "null") as
      | { u?: unknown; t?: unknown }
      | null;
    return v && v.u === userId && typeof v.t === "number" ? v.t : null;
  } catch {
    return null;
  }
}

export function writeLastActivity(userId: string, t: number): void {
  try {
    window.localStorage.setItem(LAST_ACTIVITY_KEY, JSON.stringify({ u: userId, t }));
  } catch {
    // storage disabled/full: the in-memory clock still works
  }
}
