"use client";

import { useShell } from "@/lib/context/ShellContext";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { ZonesTab } from "@/components/items/ZonesTab";
import { RiskMatrix } from "@/components/risk/RiskMatrix";
import { ScheduleView } from "@/components/schedule/ScheduleView";
import { ExportTab } from "@/components/export/ExportTab";

export function MainTabs() {
  const { tab } = useShell();
  switch (tab) {
    case "zones":
      return <ZonesTab />;
    case "risk":
      return <RiskMatrix />;
    case "schedule":
      return <ScheduleView />;
    case "export":
      return <ExportTab />;
    default:
      return <Dashboard />;
  }
}
