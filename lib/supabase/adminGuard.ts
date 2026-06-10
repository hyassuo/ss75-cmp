import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types/domain";

export interface GuardContext {
  userId: string;
  email: string;
  role: UserRole;
}

type GuardResult =
  | { ok: true; ctx: GuardContext }
  | { ok: false; status: number; error: string };

// Any authenticated AND active user. Deactivated accounts keep a valid JWT
// until it expires, so active must be re-checked on every API call.
export async function requireUser(): Promise<GuardResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, active, email")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.active) {
    return { ok: false, status: 403, error: "Account inactive" };
  }
  return {
    ok: true,
    ctx: { userId: user.id, email: profile.email, role: profile.role },
  };
}

export async function requireAdmin(): Promise<GuardResult> {
  const result = await requireUser();
  if (!result.ok) return result;
  if (result.ctx.role !== "admin") {
    return { ok: false, status: 403, error: "Admin access required" };
  }
  return result;
}
