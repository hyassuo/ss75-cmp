// CSP tuned for Next.js App Router + Supabase + Gemini:
// - inline styles are used throughout the design system -> style-src allows them
// - Next injects inline bootstrap scripts -> script-src allows 'unsafe-inline'
//   (App Router doesn't emit nonces by default); we still lock object/base/frame
//   and restrict where the app may connect/post.
const SUPABASE = "https://*.supabase.co";
const GEMINI = "https://generativelanguage.googleapis.com";
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: " + SUPABASE,
  "font-src 'self' data:",
  `connect-src 'self' ${SUPABASE} ${GEMINI}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Surgical externalisation for the PDF route. We DON'T externalise
  // @react-pdf/* — keeping it bundled means it shares the same React
  // instance as the route's createElement calls (mixing the two yields
  // React error #31, "object with keys $$typeof…" — the classic two-copy
  // problem).
  //
  // We DO externalise yoga-layout (which loads its WASM via top-level
  // await inside its module init) and fontkit (ESM with native bindings).
  // Those are pulled in transitively by @react-pdf/layout and
  // @react-pdf/font; webpack respects the externals list so the bundled
  // siblings end up doing a runtime `require()` for them, the way each
  // library was designed to load. No effect on the client bundle.
  serverExternalPackages: ["yoga-layout", "fontkit"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
