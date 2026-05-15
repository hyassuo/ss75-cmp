"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { SystemFilter } from "@/lib/utils/constants";

export type MainTab =
  | "dashboard"
  | "zones"
  | "risk"
  | "schedule"
  | "export";

interface ShellState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  sysFilter: SystemFilter;
  setSysFilter: (s: SystemFilter) => void;
  tab: MainTab;
  setTab: (t: MainTab) => void;
}

const ShellContext = createContext<ShellState | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [sysFilter, setSysFilter] = useState<SystemFilter>("All");
  const [tab, setTab] = useState<MainTab>("dashboard");

  return (
    <ShellContext.Provider
      value={{
        sidebarCollapsed,
        toggleSidebar: () => setSidebarCollapsed((v) => !v),
        sysFilter,
        setSysFilter,
        tab,
        setTab,
      }}
    >
      {children}
    </ShellContext.Provider>
  );
}

export function useShell(): ShellState {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within ShellProvider");
  return ctx;
}
