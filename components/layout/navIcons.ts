import {
  CalendarClock,
  FileDown,
  Grid3x3,
  Layers,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";
import type { MainTab } from "@/lib/context/ShellContext";

// One icon per main tab, shared by the sidebar and the phone bottom nav.
export const TAB_ICONS: Record<MainTab, LucideIcon> = {
  dashboard: LayoutDashboard,
  zones: Layers,
  risk: Grid3x3,
  schedule: CalendarClock,
  export: FileDown,
};
