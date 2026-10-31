import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/types/database.types";
import { requestIsHttps, sessionCookieOptions } from "@/lib/supabase/cookieOptions";
import {
  IDLE_REASON,
  LAST_SEEN_COOKIE,
  formatLastSeen,
  idleVerdict,
  lastSeenCookieOptions,
  lastSeenRecent,
  parseLastSeen,
  sessionKey,
} from "@/lib/security/idle";

const PUBLIC_PATHS = ["/login", "/auth"];

// requestHeaders: extra headers for the page renderer (the CSP carrying
// the nonce). Added on every forward, after any cookie refresh below, so
// server components see both the new session and the nonce.
export async function updateSession(
  request: NextRequest,
  requestHeaders: Record<string, string> = {}
) {
  const forward = () => {
    const headers = new Headers(request.headers);
    for (const [k, v] of Object.entries(requestHeaders)) headers.set(k, v);
    return NextResponse.next({ request: { headers } });
  };
  let supabaseResponse = forward();

  // Prefetch requests are background hovers/viewport hints: skip the
  // Supabase auth round-trip so section switching stays snappy for
  // signed-in users. The prefetch headers are client-controlled (trivially
  // forged with curl), so the shortcut applies only when a Supabase session
  // cookie is present; unauthenticated requests always take the full
  // check + redirect. (Real auth lives in the server layouts and RLS;
  // this gate is defense-in-depth.)
  const isPrefetch =
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch" ||
    (request.headers.get("sec-purpose") ?? "").includes("prefetch");
  const hasSupabaseCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-"));
  // ...and only while the idle clock (lib/security/idle.ts) is recent: a
  // session that may have gone idle takes the full check below.
  const lastSeen = request.cookies.get(LAST_SEEN_COOKIE)?.value;
  const now = Date.now();
  if (isPrefetch && hasSupabaseCookie && lastSeenRecent(lastSeen, now)) {
    return supabaseResponse;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without Supabase env configured, don't crash the whole site in
  // the proxy: let requests through so pages can render a clear error.
  if (!supabaseUrl || !supabaseKey) {
    return supabaseResponse;
  }

  const secure = requestIsHttps(request.url, request.headers);
  try {
    const supabase = createServerClient<Database>(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = forward();
          // Session-only cookies (the session ends when the browser
          // closes), Secure over https.
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, sessionCookieOptions(options, secure))
          );
        },
      },
    });

    const path = request.nextUrl.pathname;

    // Verifies the JWT and refreshes an expiring session (new cookies via
    // setAll above). With asymmetric JWT signing keys the check is local
    // (JWKS cached per server instance): no round-trip to Supabase Auth
    // before the page renders. With the legacy shared secret it calls
    // /auth/v1/user, like getUser(). See lib/supabase/appSession.ts.
    // getClaims() throws (rather than returning an error) on some forged
    // tokens, e.g. an unknown "alg": that is no user, not a pass-through.
    //
    // /login asks Supabase Auth itself instead (getUser; no request without
    // a session). The local check keeps accepting the token of a session
    // that was signed out or banned until it expires, and the (app) layout
    // signs such a user (inactive profile) out and sends them here:
    // bouncing them back to /dashboard would loop. getUser also clears the
    // cookies of a session Auth reports gone.
    const claims =
      path === "/login"
        ? null
        : ((await supabase.auth.getClaims().catch(() => null))?.data?.claims ??
          null);
    const user =
      path === "/login" ? (await supabase.auth.getUser()).data.user : claims;

    // Redirects carry any session cookies set above (a refreshed session,
    // whose old refresh token has just been spent, or a cleared one).
    const redirectTo = (url: URL) => {
      const res = NextResponse.redirect(url);
      for (const c of supabaseResponse.cookies.getAll()) res.cookies.set(c);
      return res;
    };

    const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

    // Server-side idle limit (lib/security/idle.ts). /login itself only
    // redirects a signed-in user to /dashboard, which is checked there.
    if (claims) {
      if (idleVerdict(parseLastSeen(lastSeen), claims, now) === "expired") {
        // Revoke the session at Supabase Auth (best effort), then clear
        // every session cookie whatever that call did: the browser must
        // not come back signed in.
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.search = "";
        url.searchParams.set("reason", IDLE_REASON);
        if (!isPublic) url.searchParams.set("next", path + request.nextUrl.search);
        const res = redirectTo(url);
        for (const c of request.cookies.getAll()) {
          if (c.name.startsWith("sb-")) res.cookies.set(c.name, "", { path: "/", maxAge: 0 });
        }
        res.cookies.set(LAST_SEEN_COOKIE, "", { path: "/", maxAge: 0 });
        return res;
      }
      // A signed-in page request is a sign of life (prefetches, which
      // the user didn't ask for, don't count).
      if (!isPrefetch) {
        supabaseResponse.cookies.set(
          LAST_SEEN_COOKIE,
          formatLastSeen(sessionKey(claims), now),
          lastSeenCookieOptions(secure)
        );
      }
    }

    if (!user && !isPublic) {
      // Remember where the user was going (e.g. a shared item link) so the
      // login can continue there. Only the path + query are kept.
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("next", path + request.nextUrl.search);
      return redirectTo(url);
    }

    // Signed in: "/" (bookmarks, apps installed with the old start_url) and
    // /login go straight to the dashboard: no render + second verification
    // of "/" (app/page.tsx) just to redirect.
    if (user && (path === "/login" || path === "/")) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return redirectTo(url);
    }

    return supabaseResponse;
  } catch {
    // Network/auth failure must not 500 every route via the proxy.
    return supabaseResponse;
  }
}
