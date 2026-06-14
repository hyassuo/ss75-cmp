import { NextResponse } from "next/server";
import { requireAdmin, sameOrigin } from "@/lib/supabase/adminGuard";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { email, password } = (await request.json()) as {
    email?: string;
    password?: string;
  };
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
    return NextResponse.json(
      { error: error?.message ?? "Could not create user" },
      { status: 400 }
    );
  }
  // Deliberate admin action -> activate the freshly created profile.
  const { error: actErr } = await admin
    .from("profiles")
    .update({ active: true })
    .eq("id", created.user.id);
  if (actErr) {
    return NextResponse.json({ error: actErr.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
