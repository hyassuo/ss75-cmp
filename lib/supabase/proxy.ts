import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/types/database.types";

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

  // Prefetch requests are background hovers/viewport hints — skip the
  // Supabase auth round-trip so section switching stays snappy for
  // signed-in users. The prefetch headers are client-controlled (trivially
  // forged with curl), so the shortcut applies only when a Supabase session
  // cookie is present; unauthenticated requests always take the full
  // check + redirect. (Real auth lives in the server layouts and RLS —
  // this gate is defense-in-depth.)
  const isPrefetch =
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch" ||
    (request.headers.get("sec-purpose") ?? "").includes("prefetch");
  const hasSupabaseCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-"));
  if (isPrefetch && hasSupabaseCookie) {
    return supabaseResponse;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without Supabase env configured, don't crash the whole site in
  // the proxy — let requests through so pages can render a clear error.
  if (!supabaseUrl || !supabaseKey) {
    return supabaseResponse;
  }

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
          cookiesToSet.forEach(({ name, value, options }) => {
            // Session-only cookies: drop maxAge/expires so the session
            // ends when the browser closes.
            const sessionOpts = { ...options };
            delete sessionOpts.maxAge;
            delete sessionOpts.expires;
            supabaseResponse.cookies.set(name, value, sessionOpts);
          });
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const path = request.nextUrl.pathname;
    const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

    if (!user && !isPublic) {
      // Remember where the user was going (e.g. a shared item link) so the
      // login can continue there. Only the path + query are kept.
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("next", path + request.nextUrl.search);
      return NextResponse.redirect(url);
    }

    if (user && path === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  } catch {
    // Network/auth failure must not 500 every route via the proxy.
    return supabaseResponse;
  }
}
