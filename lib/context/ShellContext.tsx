"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { SystemFilter } from "@/lib/utils/constants";

interface ShellState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  sysFilter: SystemFilter;
  setSysFilter: (s: SystemFilter) => void;
}

const ShellContext = createContext<ShellState | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [sysFilter, setSysFilter] = useState<SystemFilter>("All");

  return (
    <ShellContext.Provider
      value={{
        sidebarCollapsed,
        toggleSidebar: () => setSidebarCollapsed((v) => !v),
        sysFilter,
        setSysFilter,
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
