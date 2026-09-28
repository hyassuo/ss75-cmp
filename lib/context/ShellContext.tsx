"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { SystemFilter } from "@/lib/utils/constants";

export type MainTab =
  | "dashboard"
  | "zones"
  | "risk"
  | "schedule"
  | "export";

const TABS: readonly MainTab[] = ["dashboard", "zones", "risk", "schedule", "export"];
const SYS_KEY = "ss75-cmp.sysFilter";

interface ShellState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  sysFilter: SystemFilter;
  setSysFilter: (s: SystemFilter) => void;
  tab: MainTab;
  setTab: (t: MainTab) => void;
  /** Item open in the modal (?item=), and whether it is a new draft (&new=1). */
  openItemId: string | null;
  openItemIsNew: boolean;
  openItem: (id: string, opts?: { isNew?: boolean }) => void;
  /** Close the modal. The caller has already confirmed / cleaned up. */
  closeItem: () => void;
  /** Set right before closeItem so the URL change isn't treated as "Back". */
  closingIntentionally: MutableRefObject<boolean>;
}

const ShellContext = createContext<ShellState | null>(null);

// Navigation state lives in the URL (/dashboard?tab=zones&item=<id>), so a
// reload keeps the user where they were, a link opens a specific item, and
// the phone's Back button steps back through tabs and closes the item
// modal instead of leaving the app.
export function ShellProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [sysFilter, setSysFilterState] = useState<SystemFilter>("All");
  // True when this session pushed the ?item= history entry, so closing can
  // pop it (router.back) instead of stacking another entry.
  const pushedItem = useRef(false);
  const closingIntentionally = useRef(false);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(SYS_KEY);
      if (v) setSysFilterState(v as SystemFilter);
    } catch {
      // storage unavailable — default filter
    }
  }, []);

  const setSysFilter = useCallback((s: SystemFilter) => {
    setSysFilterState(s);
    try {
      window.localStorage.setItem(SYS_KEY, s);
    } catch {
      // ignore
    }
  }, []);

  const rawTab = params.get("tab");
  const tab: MainTab = TABS.includes(rawTab as MainTab)
    ? (rawTab as MainTab)
    : "dashboard";
  const openItemId = params.get("item");
  const openItemIsNew = params.get("new") === "1";

  const setTab = useCallback(
    (t: MainTab) => {
      pushedItem.current = false;
      router.push(t === "dashboard" ? "/dashboard" : `/dashboard?tab=${t}`, {
        scroll: false,
      });
    },
    [router]
  );

  const openItem = useCallback(
    (id: string, opts: { isNew?: boolean } = {}) => {
      const onMain = pathname.startsWith("/dashboard");
      const next = new URLSearchParams(onMain ? params.toString() : "");
      next.set("item", id);
      if (opts.isNew) next.set("new", "1");
      else next.delete("new");
      pushedItem.current = true;
      router.push(`/dashboard?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router]
  );

  const closeItem = useCallback(() => {
    closingIntentionally.current = true;
    if (pushedItem.current) {
      pushedItem.current = false;
      router.back();
      return;
    }
    const next = new URLSearchParams(params.toString());
    next.delete("item");
    next.delete("new");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  const value = useMemo<ShellState>(
    () => ({
      sidebarCollapsed,
      toggleSidebar: () => setSidebarCollapsed((v) => !v),
      sysFilter,
      setSysFilter,
      tab,
      setTab,
      openItemId,
      openItemIsNew,
      openItem,
      closeItem,
      closingIntentionally,
    }),
    [
      sidebarCollapsed,
      sysFilter,
      setSysFilter,
      tab,
      setTab,
      openItemId,
      openItemIsNew,
      openItem,
      closeItem,
    ]
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellState {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within ShellProvider");
  return ctx;
}
