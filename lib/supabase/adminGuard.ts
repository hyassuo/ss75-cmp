import { createClient } from "@/lib/supabase/server";

export interface AdminContext {
  userId: string;
  email: string;
}

// Returns the admin's context, or an error string if not an active admin.
export async function requireAdmin(): Promise<
  { ok: true; ctx: AdminContext } | { ok: false; status: number; error: string }
> {
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

  if (!profile || !profile.active || profile.role !== "admin") {
    return { ok: false, status: 403, error: "Admin access required" };
  }
  return { ok: true, ctx: { userId: user.id, email: profile.email } };
}
