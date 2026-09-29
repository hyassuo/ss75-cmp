// Minimal JWT helpers (no dependencies) shared by the gateway, the key
// generator and the scenarios: HS256 (Supabase's legacy shared secret) and
// ES256 (asymmetric signing keys, published as a JWKS).
import crypto from "node:crypto";
import fs from "node:fs";

const b64u = (buf) =>
  Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const fromB64u = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

// es: { key: private KeyObject, kid } signs with ES256 instead.
export function sign(payload, secret, es = null) {
  const header = b64u(JSON.stringify(es ? { alg: "ES256", typ: "JWT", kid: es.kid } : { alg: "HS256", typ: "JWT" }));
  const body = b64u(JSON.stringify(payload));
  const sig = es
    ? crypto.sign("sha256", Buffer.from(`${header}.${body}`), { key: es.key, dsaEncoding: "ieee-p1363" })
    : crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest();
  return `${header}.${body}.${b64u(sig)}`;
}

// Returns the payload, or null when the signature/expiry is invalid. An
// ES256 token is checked against esPub (public KeyObject), when given.
export function verify(token, secret, esPub = null) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header;
  try {
    header = JSON.parse(fromB64u(parts[0]).toString("utf8"));
  } catch {
    return null;
  }
  if (header.alg === "ES256") {
    if (!esPub) return null;
    const ok = crypto.verify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`),
      { key: esPub, dsaEncoding: "ieee-p1363" }, fromB64u(parts[2]));
    if (!ok) return null;
  } else {
    if (header.alg !== "HS256") return null;
    const expected = b64u(crypto.createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest());
    const a = Buffer.from(expected);
    const b = Buffer.from(parts[2]);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  }
  let payload;
  try {
    payload = JSON.parse(fromB64u(parts[1]).toString("utf8"));
  } catch {
    return null;
  }
  if (payload.exp && payload.exp * 1000 < Date.now()) return null;
  return payload;
}

// The ES256 signing key of a run (PEM file written by `jwks` below), or
// null when absent.
export const ES_KID = "e2e-es256";
export function loadEsKey(file) {
  if (!fs.existsSync(file)) return null;
  const key = crypto.createPrivateKey(fs.readFileSync(file));
  const pub = crypto.createPublicKey(key);
  return { key, pub, kid: ES_KID, jwk: { ...pub.export({ format: "jwk" }), kid: ES_KID, alg: "ES256", use: "sig" } };
}

// Long-lived API keys, shaped like Supabase's legacy anon/service_role keys.
export function apiKey(role, secret) {
  // Fixed iat/exp: the anon key is inlined into the Next build, so it must
  // be deterministic for SKIP_BUILD=1 to reuse a build.
  return sign({ iss: "supabase-e2e", ref: "localhost", role, iat: 1700000000, exp: 2000000000 }, secret);
}

// CLI: node lib/jwt.mjs <anon|service_role>  (reads JWT_SECRET)
//      node lib/jwt.mjs jwks <pem>  new ES256 key -> <pem>; prints the JWKS
//                                   PostgREST verifies with (both keys)
if (import.meta.url === `file://${process.argv[1]}`) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not set");
  if (process.argv[2] === "jwks") {
    const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    fs.writeFileSync(process.argv[3], privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
    const es = loadEsKey(process.argv[3]);
    process.stdout.write(JSON.stringify({ keys: [{ kty: "oct", alg: "HS256", k: b64u(secret) }, es.jwk] }));
  } else {
    process.stdout.write(apiKey(process.argv[2] || "anon", secret));
  }
}
