"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useShell } from "@/lib/context/ShellContext";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { TAB_CHUNKS } from "@/components/layout/tabChunks";

const loading = () => <DashboardSkeleton />;

// next/dynamic keeps a rejected import for the life of the page, so a tab
// opened while the link is down would stay broken after it comes back.
// Instead keep the skeleton up: wait for the connection and retry. Only a
// failure while online (e.g. a chunk gone after a deploy) reaches the error
// boundary, which then offers a reload.
function whenLoaded<T>(load: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let failures = 0;
    const attempt = () =>
      load().then(resolve, (err) => {
        if (!navigator.onLine) {
          window.addEventListener("online", attempt, { once: true });
        } else if (++failures < 3) {
          setTimeout(attempt, 1000 * 2 ** failures);
        } else {
          reject(err);
        }
      });
    attempt();
  });
}

const Dashboard = dynamic(
  () => whenLoaded(TAB_CHUNKS.dashboard).then((m) => m.Dashboard),
  { loading }
);
const ZonesTab = dynamic(
  () => whenLoaded(TAB_CHUNKS.zones).then((m) => m.ZonesTab),
  { loading }
);
const RiskMatrix = dynamic(
  () => whenLoaded(TAB_CHUNKS.risk).then((m) => m.RiskMatrix),
  { loading }
);
const ScheduleView = dynamic(
  () => whenLoaded(TAB_CHUNKS.schedule).then((m) => m.ScheduleView),
  { loading }
);
const ExportTab = dynamic(
  () => whenLoaded(TAB_CHUNKS.export).then((m) => m.ExportTab),
  { loading }
);

export function MainTabs() {
  const { tab } = useShell();

  // Warm every tab chunk (and SheetJS) once the first screen is up, so the
  // service worker has them cached before the link drops: a tab never
  // visited must still open offline.
  useEffect(() => {
    const warm = () => {
      for (const load of Object.values(TAB_CHUNKS)) void load().catch(() => {});
      void import("@e965/xlsx").catch(() => {});
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
    };
    if (w.requestIdleCallback) w.requestIdleCallback(warm);
    else setTimeout(warm, 2000);
  }, []);
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
