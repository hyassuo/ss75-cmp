import { redirect } from "next/navigation";
import { getAppSession } from "@/lib/supabase/appSession";
import { AuditLogTable } from "@/components/audit/AuditLogTable";

export default async function AuditLogPage() {
  // Shared with the (app) layout: no extra round-trip.
  const { userId, profile } = await getAppSession();
  if (!userId) redirect("/login");
  if (!profile || profile.role !== "admin") redirect("/dashboard");

  return <AuditLogTable />;
}
