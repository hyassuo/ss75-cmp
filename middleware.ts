import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { newNonce, pageCsp } from "@/lib/security/csp";

export async function middleware(request: NextRequest) {
  // Every page gets its own nonce. It travels to the renderer in the
  // request's CSP header (Next.js takes the nonce from there) and to the
  // browser in the response's.
  const csp = pageCsp(newNonce());
  const response = await updateSession(request, {
    "content-security-policy": csp,
  });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // API routes (api/*) auth themselves via requireUser/requireAdmin and
  // return JSON. Letting the middleware 307-redirect them to /login breaks
  // fetch-based clients (a download then receives an HTML page instead of
  // the expected JSON / binary), so they're excluded here.
  // PWA files (manifest, service worker, offline page) must be reachable
  // without a session — the browser fetches them outside the auth flow and
  // a 307-to-login would corrupt the install/precache.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|offline\\.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
