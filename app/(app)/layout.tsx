import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ShellProvider } from "@/lib/context/ShellContext";
import { DataProvider } from "@/lib/context/DataContext";
import { LangProvider } from "@/lib/context/LangContext";
import { AppShell } from "@/components/layout/AppShell";
import type { Profile } from "@/lib/types/domain";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <LangProvider>
      <ShellProvider>
        <DataProvider profile={profile as Profile}>
          <AppShell>{children}</AppShell>
        </DataProvider>
      </ShellProvider>
    </LangProvider>
  );
}
