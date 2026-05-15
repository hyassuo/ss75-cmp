import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserTable } from "@/components/users/UserTable";

export default async function UsersPage() {
  const supabase = createClient();
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

  return <UserTable currentUserId={user.id} />;
}
