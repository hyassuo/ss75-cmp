import { NextResponse } from "next/server";
import { readJson, requireAdmin, sameOrigin } from "@/lib/supabase/adminGuard";
import { createServiceClient } from "@/lib/supabase/server";
import { rateLimitShared } from "@/lib/utils/rateLimit";
import { canonicalUuid } from "@/lib/utils/uuid";

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

  const body = await readJson<{ id?: string }>(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ error: "User id required" }, { status: 400 });
  }
  // Canonical (lower-case) form before any comparison or query: an
  // upper-case copy of the admin's own id must not pass as someone else.
  const id = canonicalUuid(body.id);
  if (!id) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }
  if (id === canonicalUuid(guard.ctx.userId)) {
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

  // The friendly first check; the database enforces the same rule under a
  // lock (guard_last_admin), which concurrent changes can't race.
  const onlyActiveAdmin = async () => {
    if (target.role !== "admin" || !target.active) return false;
    let q = admin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("active", true);
    q = guard.ctx.unitId
      ? q.eq("unit_id", guard.ctx.unitId)
      : q.is("unit_id", null);
    const { count } = await q;
    return (count ?? 0) <= 1;
  };
  const lastAdmin = { error: "Cannot delete the only active admin." };
  if (await onlyActiveAdmin()) {
    return NextResponse.json(lastAdmin, { status: 400 });
  }

  // Deleting the auth user cascades to public.profiles (ON DELETE CASCADE).
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    console.error("[users/delete]", error);
    // Auth reports a refused cascade as a bare "Database error deleting
    // user": when the reason is guard_last_admin (another admin removed
    // meanwhile), say so instead.
    if (await onlyActiveAdmin().catch(() => false)) {
      return NextResponse.json(lastAdmin, { status: 400 });
    }
    return NextResponse.json({ error: "Could not delete user" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
