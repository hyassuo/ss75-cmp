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
import { SYSTEMS, type SystemFilter } from "@/lib/utils/constants";

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
//
// Within /dashboard the URL is changed with the History API (Next ≥ 14.1
// keeps useSearchParams in sync): no server round-trip, so switching tabs
// and opening items keep working offline and cost nothing on VSAT.
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
      // Ignore stale values (a renamed department would empty every list).
      if (v && (v === "All" || (SYSTEMS as readonly string[]).includes(v))) {
        setSysFilterState(v as SystemFilter);
      }
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

  const onMain = pathname.startsWith("/dashboard");

  // Landing directly on an item (reload, shared link): put a plain entry
  // underneath it so Back closes the modal (through its discard check)
  // instead of leaving the app.
  useEffect(() => {
    if (!onMain || !openItemId || pushedItem.current) return;
    const under = new URLSearchParams(params.toString());
    under.delete("item");
    under.delete("new");
    const qs = under.toString();
    const full = `/dashboard?${params.toString()}`;
    // Deferred one task: child effects run before Next's AppRouter patches
    // window.history, and entries written earlier carry a null state that
    // Next's popstate handler ignores (Back would change the URL but not
    // close the modal).
    const h = setTimeout(() => {
      window.history.replaceState(null, "", qs ? `/dashboard?${qs}` : "/dashboard");
      window.history.pushState(null, "", full);
      pushedItem.current = true;
    }, 0);
    return () => clearTimeout(h);
    // Once, on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // However the item closed (Cancel, Back), nothing is pushed any more.
  useEffect(() => {
    if (!openItemId) pushedItem.current = false;
  }, [openItemId]);

  const setTab = useCallback(
    (t: MainTab) => {
      const url = t === "dashboard" ? "/dashboard" : `/dashboard?tab=${t}`;
      pushedItem.current = false;
      if (onMain) window.history.pushState(null, "", url);
      else router.push(url, { scroll: false });
    },
    [onMain, router]
  );

  const openItem = useCallback(
    (id: string, opts: { isNew?: boolean } = {}) => {
      const next = new URLSearchParams(onMain ? params.toString() : "");
      next.set("item", id);
      if (opts.isNew) next.set("new", "1");
      else next.delete("new");
      const url = `/dashboard?${next.toString()}`;
      pushedItem.current = true;
      if (onMain) window.history.pushState(null, "", url);
      else router.push(url, { scroll: false });
    },
    [onMain, params, router]
  );

  const closeItem = useCallback(() => {
    // Already closed (e.g. Back won a race with Cancel): don't navigate
    // again — a second back() would leave the tab or the app.
    if (!params.get("item")) return;
    closingIntentionally.current = true;
    if (pushedItem.current) {
      pushedItem.current = false;
      window.history.back();
      return;
    }
    const next = new URLSearchParams(params.toString());
    next.delete("item");
    next.delete("new");
    const qs = next.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }, [params, pathname]);

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
