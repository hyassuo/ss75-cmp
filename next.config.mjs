import { readFileSync } from "node:fs";

// Content-Security-Policy, three layers:
//  - every response starts with lockedCsp (below): API JSON, images, the
//    favicon and their 404 pages need no script, style or connection;
//  - pages replace it with the per-request nonce policy set by the
//    proxy (proxy.ts, lib/security/csp.ts): proxy headers win over these;
//  - the static offline page replaces it with offlineCsp (no script at all;
//    the later matching rule wins);
//  - the service worker gets swCsp: a worker script's CSP governs the
//    worker itself, and it must fetch/cache same-origin pages and assets.
const offlineCsp = [
  "default-src 'self'",
  "script-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const swCsp = "default-src 'self'";

const lockedCsp = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";

const securityHeaders = [
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
  { key: "Content-Security-Policy", value: lockedCsp },
];

// Only the version reaches the client bundle (importing package.json in a
// client component would ship the whole dependency list).
const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8")
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  env: { NEXT_PUBLIC_APP_VERSION: version },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        source: "/offline.html",
        headers: [{ key: "Content-Security-Policy", value: offlineCsp }],
      },
      {
        source: "/sw.js",
        headers: [{ key: "Content-Security-Policy", value: swCsp }],
      },
    ];
  },
};

export default nextConfig;
