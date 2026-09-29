import { readFileSync } from "node:fs";

// Pages get a per-request, nonce-based Content-Security-Policy from the
// middleware (lib/security/csp.ts). The only HTML served around it is the
// static offline page, which needs no script at all.
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
    ];
  },
};

export default nextConfig;
