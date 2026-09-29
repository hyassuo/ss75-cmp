import { redirect } from "next/navigation";
import { getAppSession } from "@/lib/supabase/appSession";
import { UserTable } from "@/components/users/UserTable";

export default async function UsersPage() {
  // Shared with the (app) layout: no extra round-trip.
  const { userId, profile } = await getAppSession();
  if (!userId) redirect("/login");
  if (!profile || profile.role !== "admin") redirect("/dashboard");

  return <UserTable currentUserId={userId} />;
}
