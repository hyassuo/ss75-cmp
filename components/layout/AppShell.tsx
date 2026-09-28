"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DS } from "@/lib/design/tokens";
import { Topbar } from "@/components/layout/Topbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { Footer } from "@/components/layout/Footer";
import { BottomNav } from "@/components/layout/BottomNav";
import { AlertBar } from "@/components/dashboard/AlertBar";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import {
  ConnectionBanner,
  DeployLogout,
  IdleLogout,
} from "@/components/layout/SessionGuards";
import { NewItemProvider } from "@/lib/context/NewItemContext";
import { ItemModalHost } from "@/components/items/ItemModalHost";
import { useData } from "@/lib/context/DataContext";
import { useShell } from "@/lib/context/ShellContext";
import { useLang } from "@/lib/context/LangContext";

export function AppShell({ children }: { children: ReactNode }) {
  const { loading, error, clearError } = useData();
  const { tab } = useShell();
  const { t } = useLang();
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Reset the content scroll to the top whenever the user changes tab or
  // route. Otherwise jumping from a long scrolled Zones view to Dashboard
  // would leave them mid-page.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [tab, pathname]);

  // The alert bar is only relevant in the operational tabs. Suppress it on
  // admin/reporting surfaces so it doesn't follow the user into Users,
  // Audit Log or the Export view.
  const onAdminRoute =
    pathname.startsWith("/users") || pathname.startsWith("/audit-log");
  const showAlerts = !onAdminRoute && tab !== "export";

  return (
    <NewItemProvider>
      <IdleLogout />
      <DeployLogout />
      <ConnectionBanner />
      <div
        id="app-root"
        style={{
          // position:fixed/inset:0 anchors to the *visible* viewport on iOS
          // Safari, sidestepping the 100vh/100dvh quirks where the layout
          // ends up taller than the visible area (cutting the sidebar
          // bottom and forcing rubber-band scrolling on main content).
          position: "fixed",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          background: DS.bg,
          color: DS.text,
          fontFamily: DS.sans,
        }}
      >
        <Topbar />
        <div
          style={{
            display: "flex",
            flex: 1,
            overflow: "hidden",
            minHeight: 0,
          }}
        >
          <Sidebar />
          <main
            ref={scrollRef}
            className="app-content"
            style={{
              flex: 1,
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
              background: DS.bg,
              padding: "0 24px 24px",
            }}
          >
            <div style={{ paddingTop: 16 }}>
              {error && (
                <div
                  role="alert"
                  style={{
                    background: DS.redBg,
                    border: "1px solid " + DS.redBord,
                    borderRadius: 8,
                    padding: "10px 14px",
                    marginBottom: 16,
                    fontSize: 12,
                    color: DS.red,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span style={{ flex: 1 }}>{error}</span>
                  <button
                    type="button"
                    onClick={clearError}
                    aria-label={t("common.dismiss")}
                    style={{
                      background: "none",
                      border: "none",
                      color: DS.red,
                      fontSize: 18,
                      cursor: "pointer",
                      minWidth: 32,
                      minHeight: 32,
                    }}
                  >
                    ×
                  </button>
                </div>
              )}
              {loading ? (
                <DashboardSkeleton />
              ) : (
                <>
                  {showAlerts && <AlertBar />}
                  {children}
                </>
              )}
            </div>
          </main>
        </div>
        <BottomNav />
        <Footer />
      </div>
      {/* Rendered outside #app-root: the modal marks #app-root inert. */}
      {!loading && <ItemModalHost />}
    </NewItemProvider>
  );
}
