import { NextResponse } from "next/server";
import { readJson, sameOrigin } from "@/lib/supabase/adminGuard";
import { createServiceClient } from "@/lib/supabase/server";
import { sendRecoveryEmail } from "@/lib/supabase/recoveryMail";
import { rateLimitShared } from "@/lib/utils/rateLimit";

export const runtime = "nodejs";

// "Forgot password?" on the login page. Public, so: the same answer whether
// or not the address has an account (no account probing), mail only for
// active accounts, and throttled per client and per address.
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
  // create) per-address counters.
  const byIp = await rateLimitShared(`forgot-ip:${ip}`, 5, 15 * 60_000);
  if (!byIp.allowed) return tooMany(byIp.retryAfter);
  // The address is stored hashed: the counters table holds no email list.
  const byEmail = await rateLimitShared(
    `forgot-email:${await sha256Hex(email)}`,
    3,
    60 * 60_000
  );
  if (!byEmail.allowed) return tooMany(byEmail.retryAfter);

  const admin = createServiceClient();
  // Exact, case-insensitive match (escape LIKE wildcards in the address).
  const pattern = email.replace(/[\\%_]/g, (c) => "\\" + c);
  const { data: profile } = await admin
    .from("profiles")
    .select("email, active")
    .ilike("email", pattern)
    .maybeSingle();
  if (profile?.active) {
    const { error } = await sendRecoveryEmail(
      profile.email,
      new URL(request.url).origin
    );
    if (error) console.error("[auth/forgot]", error);
  }
  return NextResponse.json({ ok: true });
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
