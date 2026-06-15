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

  const { id } = (await request.json()) as { id?: string };
  if (!id) {
    return NextResponse.json({ error: "User id required" }, { status: 400 });
  }
  if (id === guard.ctx.userId) {
    return NextResponse.json(
      { error: "You cannot delete yourself." },
      { status: 400 }
    );
  }

  const admin = createServiceClient();
  const { data: target } = await admin
    .from("profiles")
    .select("role, active, unit_id")
    .eq("id", id)
    .single();
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  // An admin may only delete users in their own unit. Service client bypasses
  // RLS, so enforce it here. 404 (not 403) to avoid leaking other units.
  if (target.unit_id !== guard.ctx.unitId) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (target.role === "admin" && target.active) {
    let q = admin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("active", true);
    q = guard.ctx.unitId
      ? q.eq("unit_id", guard.ctx.unitId)
      : q.is("unit_id", null);
    const { count } = await q;
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the only active admin." },
        { status: 400 }
      );
    }
  }

  // Deleting the auth user cascades to public.profiles (ON DELETE CASCADE).
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
