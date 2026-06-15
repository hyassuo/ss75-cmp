import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types/domain";

export interface GuardContext {
  userId: string;
  email: string;
  role: UserRole;
  unitId: string | null;
}

type GuardResult =
  | { ok: true; ctx: GuardContext }
  | { ok: false; status: number; error: string };

// Any authenticated AND active user. Deactivated accounts keep a valid JWT
// until it expires, so active must be re-checked on every API call.
export async function requireUser(): Promise<GuardResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, active, email, unit_id")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.active) {
    return { ok: false, status: 403, error: "Account inactive" };
  }
  return {
    ok: true,
    ctx: {
      userId: user.id,
      email: profile.email,
      role: profile.role,
      unitId: profile.unit_id,
    },
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

// CSRF defense-in-depth: reject cross-site mutations. Cookies are SameSite=Lax
// (so cross-site POSTs already drop the session), this is a second layer.
// Allows same-origin requests and server-to-server calls with no Origin header.
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser / same-origin fetch without Origin
  const host = request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
