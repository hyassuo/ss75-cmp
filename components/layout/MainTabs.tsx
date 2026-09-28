"use client";

import dynamic from "next/dynamic";
import { useShell } from "@/lib/context/ShellContext";
import { DashboardSkeleton } from "@/components/ui/Skeleton";

// One chunk per tab: the first load carries only the tab being shown.
const loading = () => <DashboardSkeleton />;
const Dashboard = dynamic(
  () => import("@/components/dashboard/Dashboard").then((m) => m.Dashboard),
  { loading }
);
const ZonesTab = dynamic(
  () => import("@/components/items/ZonesTab").then((m) => m.ZonesTab),
  { loading }
);
const RiskMatrix = dynamic(
  () => import("@/components/risk/RiskMatrix").then((m) => m.RiskMatrix),
  { loading }
);
const ScheduleView = dynamic(
  () => import("@/components/schedule/ScheduleView").then((m) => m.ScheduleView),
  { loading }
);
const ExportTab = dynamic(
  () => import("@/components/export/ExportTab").then((m) => m.ExportTab),
  { loading }
);

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
