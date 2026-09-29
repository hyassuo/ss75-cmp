import { NextResponse } from "next/server";
import { readJson, requireAdmin, sameOrigin } from "@/lib/supabase/adminGuard";
import { createServiceClient } from "@/lib/supabase/server";
import { sendRecoveryEmail } from "@/lib/supabase/recoveryMail";
import { rateLimit } from "@/lib/utils/rateLimit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  // Tighter than the other admin routes — each call sends an email.
  const rl = rateLimit(`users-reset:${guard.ctx.userId}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const body = await readJson<{ email?: string }>(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { email } = body;
  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const admin = createServiceClient();
  // Only send resets to users that actually exist in this system — prevents
  // using the endpoint to fire Supabase emails at arbitrary addresses — and
  // only to users in the requesting admin's own unit.
  const { data: target } = await admin
    .from("profiles")
    .select("id, unit_id")
    .eq("email", email)
    .maybeSingle();
  if (!target || target.unit_id !== guard.ctx.unitId) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // The link points back at the site the admin is using.
  const { error } = await sendRecoveryEmail(email, new URL(request.url).origin);
  if (error) {
    console.error("[users/reset]", error);
    return NextResponse.json(
      { error: "Could not send reset email" },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true });
}
