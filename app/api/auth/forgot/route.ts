import { NextResponse, after } from "next/server";
import { readJson, sameOrigin } from "@/lib/supabase/adminGuard";
import { createServiceClient } from "@/lib/supabase/server";
import { sendRecoveryEmail } from "@/lib/supabase/recoveryMail";
import { rateLimitShared } from "@/lib/utils/rateLimit";

export const runtime = "nodejs";

// "Forgot password?" on the login page. Public, so:
//  - the same answer, in the same time, whether or not the address has an
//    account: the account lookup and the email happen after the response
//    is sent (after()), so neither the answer nor its timing tells which
//    addresses exist;
//  - mail only for active accounts;
//  - throttled per client, per address from that client (tight), and per
//    address from every client (a looser ceiling). Keying the tight limit
//    on the address alone let anyone lock a colleague out of resetting for
//    an hour with three requests; now that takes several clients at once,
//    while the ceiling still caps the mails one address can be sent.
const PER_CLIENT = { limit: 5, windowMs: 15 * 60_000 };
const PER_ADDRESS_CLIENT = { limit: 3, windowMs: 60 * 60_000 };
const PER_ADDRESS = { limit: 10, windowMs: 60 * 60_000 };

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Vercel sets x-forwarded-for itself; capped so an odd value can't
  // produce an oversized key.
  const ip = (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  ).slice(0, 64);
  const body = await readJson<{ email?: unknown }>(request);
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  // Per client first: a client already refused doesn't get to touch (or
  // create) per-address counters; likewise each narrower refusal spares
  // the wider counter after it.
  const byIp = await rateLimitShared(`forgot-ip:${ip}`, PER_CLIENT.limit, PER_CLIENT.windowMs);
  if (!byIp.allowed) return tooMany(byIp.retryAfter);
  // Addresses are stored hashed: the counters table holds no email list.
  const addr = await sha256Hex(email);
  const byAddrIp = await rateLimitShared(
    `forgot-email-ip:${await sha256Hex(`${email}|${ip}`)}`,
    PER_ADDRESS_CLIENT.limit,
    PER_ADDRESS_CLIENT.windowMs
  );
  if (!byAddrIp.allowed) return tooMany(byAddrIp.retryAfter);
  const byAddr = await rateLimitShared(`forgot-email:${addr}`, PER_ADDRESS.limit, PER_ADDRESS.windowMs);
  if (!byAddr.allowed) return tooMany(byAddr.retryAfter);

  const origin = new URL(request.url).origin;
  after(() => sendIfActive(email, origin));
  return NextResponse.json({ ok: true });
}

// Runs after the response: errors are only logged.
async function sendIfActive(email: string, origin: string): Promise<void> {
  try {
    const admin = createServiceClient();
    // Exact, case-insensitive match (escape LIKE wildcards in the address).
    const pattern = email.replace(/[\\%_]/g, (c) => "\\" + c);
    const { data: profile } = await admin
      .from("profiles")
      .select("email, active")
      .ilike("email", pattern)
      .maybeSingle();
    if (!profile?.active) return;
    const { error } = await sendRecoveryEmail(profile.email, origin);
    if (error) console.error("[auth/forgot]", error);
  } catch (e) {
    console.error("[auth/forgot]", e);
  }
}

function tooMany(retryAfter: number) {
  return NextResponse.json(
    { error: "Too many requests" },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}
