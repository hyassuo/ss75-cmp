// Content-Security-Policy for the app's HTML pages, built per request with
// a fresh nonce (see proxy.ts). Next.js reads the nonce from the
// request's CSP header and stamps it on its own bootstrap scripts;
// 'strict-dynamic' lets those load the app's chunks. Anything else (an
// injected <script>, an inline event handler, eval) is refused.
//
// Browser traffic goes only to this origin and the project's Supabase URL
// (REST, auth, storage downloads). Gemini is called by the server, never by
// the browser, so it is not listed.

// The project's Supabase origin, or every Supabase project if the URL is
// missing/invalid (the app can't work then anyway).
function supabaseOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "https://*.supabase.co";
  }
}

export function pageCsp(nonce: string): string {
  // Dev only: React Refresh evaluates code and talks to the HMR socket.
  const dev = process.env.NODE_ENV !== "production";
  const supabase = supabaseOrigin();
  return [
    "default-src 'self'",
    // 'wasm-unsafe-eval': the PDF export's layout engine (yoga) is WebAssembly.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
    // The design system styles with inline style attributes.
    "style-src 'self' 'unsafe-inline'",
    // No Supabase origin: evidence photos are downloaded with the session
    // and shown as blob: URLs (C7), never loaded from a storage URL.
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // data:: the PDF layout engine fetch()es its inlined WebAssembly.
    `connect-src 'self' data: ${supabase}${dev ? " ws:" : ""}`,
    // blob:: the PDF export's PNG decoder (fflate) inflates in a blob worker.
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

// A nonce per response: 128 random bits, base64.
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
