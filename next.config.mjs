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
  // @react-pdf/renderer pulls in yoga-layout (WASM loaded via top-level
  // await) and fontkit through @react-pdf/font. The Next 15 bundler mangles
  // that chain — the route compiles but renderToBuffer() throws at runtime
  // (HTTP 500). Externalising only the root package isn't enough because the
  // bundler still rewrites the imports of its siblings. Mark every package
  // in the chain external so each is required from node_modules at runtime,
  // which is the way the library was designed to load.
  serverExternalPackages: [
    "@react-pdf/renderer",
    "@react-pdf/layout",
    "@react-pdf/font",
    "@react-pdf/pdfkit",
    "@react-pdf/textkit",
    "@react-pdf/image",
    "@react-pdf/svg",
    "@react-pdf/stylesheet",
    "@react-pdf/render",
    "@react-pdf/primitives",
    "@react-pdf/reconciler",
    "@react-pdf/fns",
    "@react-pdf/types",
    "yoga-layout",
    "fontkit",
  ],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
