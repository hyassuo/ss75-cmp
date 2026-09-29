import type { MainTab } from "@/lib/context/ShellContext";

// One chunk per tab: the first load carries only the tab being shown.
export const TAB_CHUNKS = {
  dashboard: () => import("@/components/dashboard/Dashboard"),
  zones: () => import("@/components/items/ZonesTab"),
  risk: () => import("@/components/risk/RiskMatrix"),
  schedule: () => import("@/components/schedule/ScheduleView"),
  export: () => import("@/components/export/ExportTab"),
} satisfies Record<MainTab, () => Promise<unknown>>;
