"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DS } from "@/lib/design/tokens";
import { Topbar } from "@/components/layout/Topbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { Footer } from "@/components/layout/Footer";
import { AlertBar } from "@/components/dashboard/AlertBar";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { NewItemProvider } from "@/lib/context/NewItemContext";
import { useData } from "@/lib/context/DataContext";
import { useShell } from "@/lib/context/ShellContext";

export function AppShell({ children }: { children: ReactNode }) {
  const { loading, error } = useData();
  const { tab } = useShell();
  const pathname = usePathname();

  // The alert bar is only relevant in the operational tabs. Suppress it on
  // admin/reporting surfaces so it doesn't follow the user into Users,
  // Audit Log or the Export view.
  const onAdminRoute =
    pathname.startsWith("/users") || pathname.startsWith("/audit-log");
  const showAlerts = !onAdminRoute && tab !== "export";

  return (
    <NewItemProvider>
      <div
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
          <div
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
                  style={{
                    background: DS.redBg,
                    border: "1px solid " + DS.redBord,
                    borderRadius: 8,
                    padding: "10px 14px",
                    marginBottom: 16,
                    fontSize: 12,
                    color: DS.red,
                  }}
                >
                  {error}
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
          </div>
        </div>
        <Footer />
      </div>
    </NewItemProvider>
  );
}
