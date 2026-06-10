import { NextResponse } from "next/server";
import { requireAdmin, sameOrigin } from "@/lib/supabase/adminGuard";
import { createServiceClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types/domain";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id, role, active } = (await request.json()) as {
    id?: string;
    role?: UserRole;
    active?: boolean;
  };
  if (!id) {
    return NextResponse.json({ error: "User id required" }, { status: 400 });
  }
  if (role && !["admin", "inspector", "viewer"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const isSelf = id === guard.ctx.userId;
  const demotingSelf = isSelf && role && role !== "admin";
  const deactivatingSelf = isSelf && active === false;
  if (demotingSelf || deactivatingSelf) {
    return NextResponse.json(
      { error: "You cannot demote or deactivate yourself." },
      { status: 400 }
    );
  }

  const admin = createServiceClient();
  const { data: target } = await admin
    .from("profiles")
    .select("role, active")
    .eq("id", id)
    .single();
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const losesAdmin =
    target.role === "admin" &&
    ((role && role !== "admin") || active === false);
  if (losesAdmin) {
    const { count } = await admin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("active", true);
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "Cannot remove the only active admin." },
        { status: 400 }
      );
    }
  }

  const patch: { role?: UserRole; active?: boolean } = {};
  if (role) patch.role = role;
  if (typeof active === "boolean") patch.active = active;
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error } = await admin.from("profiles").update(patch).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
