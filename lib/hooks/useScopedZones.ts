"use client";

import { useMemo } from "react";
import { useData } from "@/lib/context/DataContext";
import { useShell } from "@/lib/context/ShellContext";

// Zones of the department picked in the top bar ("All" = every zone).
// Every screen that lists items goes through this, so the filter means
// the same thing everywhere.
export function useScopedZones() {
  const { zones } = useData();
  const { sysFilter } = useShell();
  return useMemo(
    () =>
      sysFilter === "All" ? zones : zones.filter((z) => z.system === sysFilter),
    [zones, sysFilter]
  );
}
