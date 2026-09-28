// Minimal HS256 JWT helpers (no dependencies) shared by the gateway, the
// key generator and the scenarios.
import crypto from "node:crypto";

const b64u = (buf) =>
  Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const fromB64u = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export function sign(payload, secret) {
  const header = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64u(JSON.stringify(payload));
  const sig = b64u(crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

// Returns the payload, or null when the signature/expiry is invalid.
export function verify(token, secret) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = b64u(crypto.createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest());
  const a = Buffer.from(expected);
  const b = Buffer.from(parts[2]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(fromB64u(parts[1]).toString("utf8"));
  } catch {
    return null;
  }
  if (payload.exp && payload.exp * 1000 < Date.now()) return null;
  return payload;
}

// Long-lived API keys, shaped like Supabase's legacy anon/service_role keys.
export function apiKey(role, secret) {
  // Fixed iat/exp: the anon key is inlined into the Next build, so it must
  // be deterministic for SKIP_BUILD=1 to reuse a build.
  return sign({ iss: "supabase-e2e", ref: "localhost", role, iat: 1700000000, exp: 2000000000 }, secret);
}

// CLI: node lib/jwt.mjs <anon|service_role>  (reads JWT_SECRET)
if (import.meta.url === `file://${process.argv[1]}`) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not set");
  process.stdout.write(apiKey(process.argv[2] || "anon", secret));
}
