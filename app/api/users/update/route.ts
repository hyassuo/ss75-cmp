import { NextResponse } from "next/server";
import { readJson, requireAdmin, sameOrigin } from "@/lib/supabase/adminGuard";
import { createServiceClient } from "@/lib/supabase/server";
import { rateLimitShared } from "@/lib/utils/rateLimit";
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

  const rl = await rateLimitShared(`users:${guard.ctx.userId}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const body = await readJson<{
    id?: string;
    role?: UserRole;
    active?: boolean;
  }>(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { id, role, active } = body;
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
    .select("role, active, unit_id")
    .eq("id", id)
    .single();
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  // An admin may only manage users in their own unit. The service client
  // bypasses RLS, so this must be enforced here explicitly.
  if (target.unit_id !== guard.ctx.unitId) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const losesAdmin =
    target.role === "admin" &&
    ((role && role !== "admin") || active === false);
  if (losesAdmin) {
    // Count active admins within the same unit: don't let a unit lose its
    // last admin (a global count would wrongly allow it when another unit
    // still has admins).
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

  // Deactivation must also end the user's sessions. RLS already denies an
  // inactive profile every row, but the refresh token would keep the
  // session alive; a ban stops refreshes and new sign-ins (the current
  // access token lapses within the hour). Reactivation lifts it. Done
  // before the profile change: if it fails nothing has changed, and the
  // table still offers the same action to retry.
  if (typeof active === "boolean") {
    const { error: banError } = await admin.auth.admin.updateUserById(id, {
      ban_duration: active ? "none" : "876000h",
    });
    if (banError) {
      console.error("[users/update] ban", banError);
      return NextResponse.json(
        { error: "Could not update the user's sign-in access. Try again." },
        { status: 502 }
      );
    }
  }

  const { error } = await admin.from("profiles").update(patch).eq("id", id);
  if (error) {
    console.error("[users/update]", error);
    return NextResponse.json({ error: "Could not update user" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
