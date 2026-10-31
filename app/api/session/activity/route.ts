import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { sameOrigin } from "@/lib/supabase/adminGuard";
import { createClient } from "@/lib/supabase/server";
import { requestIsHttps } from "@/lib/supabase/cookieOptions";
import { rateLimit } from "@/lib/utils/rateLimit";
import {
  IDLE_EXPIRED_ERROR,
  LAST_SEEN_COOKIE,
  formatLastSeen,
  idleVerdict,
  lastSeenCookieOptions,
  parseLastSeen,
  sessionKey,
} from "@/lib/security/idle";

export const runtime = "nodejs";

// The browser's "still here" ping (SessionGuards, at most once a minute
// while the user is active): keeps the server's idle clock (the last-seen
// cookie, lib/security/idle.ts) in step when someone works for a long time
// without loading a page. API routes are outside the proxy, so this one
// applies the same rule itself: a session already idle past the limit is
// signed out here too (401), never revived.
export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = await createClient();
  const claims =
    (await supabase.auth.getClaims().catch(() => null))?.data?.claims ?? null;
  if (!claims) {
    // Not an idle verdict: the browser does not sign out on this one (it
    // may be a transient failure to verify the session).
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Cheap, so a per-instance cap is plenty (pings come once a minute).
  if (!rateLimit(`activity:${claims.sub}`, 30, 60_000).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const store = await cookies();
  const now = Date.now();
  const verdict = idleVerdict(parseLastSeen(store.get(LAST_SEEN_COOKIE)?.value), claims, now);
  if (verdict === "expired") {
    // Revokes the session at Supabase Auth and clears its cookies (the
    // server client's setAll); the browser then goes to /login.
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    for (const c of store.getAll()) {
      if (c.name.startsWith("sb-")) store.set(c.name, "", { path: "/", maxAge: 0 });
    }
    store.set(LAST_SEEN_COOKIE, "", { path: "/", maxAge: 0 });
    return NextResponse.json({ error: IDLE_EXPIRED_ERROR }, { status: 401 });
  }
  store.set(
    LAST_SEEN_COOKIE,
    formatLastSeen(sessionKey(claims), now),
    lastSeenCookieOptions(requestIsHttps(request.url, await headers()))
  );
  return new NextResponse(null, { status: 204 });
}
