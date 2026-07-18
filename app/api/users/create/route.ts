import { NextResponse } from "next/server";
import { readJson, requireAdmin, sameOrigin } from "@/lib/supabase/adminGuard";
import { createServiceClient } from "@/lib/supabase/server";
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

  // Shared budget across the create/delete/update admin mutations.
  const rl = rateLimit(`users:${guard.ctx.userId}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const body = await readJson<{ email?: string; password?: string }>(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { email, password } = body;
  if (!email || !/.+@.+\..+/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const admin = createServiceClient();
  // Create a confirmed user directly (no SMTP dependency). The
  // handle_new_user trigger auto-creates the profile as INACTIVE.
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !created.user) {
    // Log the real GoTrue reason server-side only — raw auth/DB strings are
    // internal detail, not client copy.
    console.error("[users/create]", error);
    return NextResponse.json({ error: "Could not create user" }, { status: 400 });
  }
  // Deliberate admin action -> activate the freshly created profile and bind
  // it to the creating admin's unit (the handle_new_user trigger assigns a
  // default unit; override it so an admin can only ever create users in
  // their own unit).
  const activation: { active: boolean; unit_id?: string } = { active: true };
  if (guard.ctx.unitId) activation.unit_id = guard.ctx.unitId;
  const { error: actErr } = await admin
    .from("profiles")
    .update(activation)
    .eq("id", created.user.id);
  if (actErr) {
    console.error("[users/create] activation", actErr);
    return NextResponse.json(
      { error: "User created but could not be activated" },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
