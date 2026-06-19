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
  // @react-pdf/renderer pulls in yoga-layout (WASM) and fontkit, which the
  // Next 15 bundler can mangle (the resulting bundle fails at runtime with
  // a 500 inside /api/export/pdf). Marking them external tells Next to keep
  // them as plain node_modules requires at runtime, which is what they
  // expect. Without this the PDF route compiles but throws on
  // renderToBuffer().
  serverExternalPackages: ["@react-pdf/renderer"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
