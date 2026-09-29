import { redirect } from "next/navigation";
import { getAppSession, getVisibleItemCount } from "@/lib/supabase/appSession";
import { ShellProvider } from "@/lib/context/ShellContext";
import { DataProvider } from "@/lib/context/DataContext";
import { AppShell } from "@/components/layout/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ supabase, userId, profile }, itemCount] = await Promise.all([
    getAppSession(),
    getVisibleItemCount(),
  ]);
  if (!userId) redirect("/login");

  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <ShellProvider>
      <DataProvider profile={profile} itemCountHint={itemCount}>
        <AppShell>{children}</AppShell>
      </DataProvider>
    </ShellProvider>
  );
}
