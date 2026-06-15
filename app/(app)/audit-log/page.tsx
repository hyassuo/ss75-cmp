import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuditLogTable } from "@/components/audit/AuditLogTable";

export default async function AuditLogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") redirect("/dashboard");

  return <AuditLogTable />;
}
