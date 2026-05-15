import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/adminGuard";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { email } = (await request.json()) as { email?: string };
  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const admin = createServiceClient();
  const redirectTo =
    (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000") + "/login";
  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
