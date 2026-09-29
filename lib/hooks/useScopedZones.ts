"use client";

import { useMemo } from "react";
import { useData } from "@/lib/context/DataContext";
import { useShell } from "@/lib/context/ShellContext";

// Zones of the department picked in the top bar ("All" = every zone), for
// screens that list items (Risk Matrix, Schedule). Dashboard, Zones,
// AlertBar and the top bar apply the same rule inline.
export function useScopedZones() {
  const { zones } = useData();
  const { sysFilter } = useShell();
  return useMemo(
    () =>
      sysFilter === "All" ? zones : zones.filter((z) => z.system === sysFilter),
    [zones, sysFilter]
  );
}
