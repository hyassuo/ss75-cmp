"use client";

import type { ReactNode } from "react";
import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";
import { Topbar } from "@/components/layout/Topbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { Footer } from "@/components/layout/Footer";
import { AlertBar } from "@/components/dashboard/AlertBar";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { NewItemProvider } from "@/lib/context/NewItemContext";
import { useData } from "@/lib/context/DataContext";

export function AppShell({ children }: { children: ReactNode }) {
  const { loading, error } = useData();

  return (
    <NewItemProvider>
      <div style={{ ...S.page, height: "100dvh", overflow: "hidden" }}>
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
                  <AlertBar />
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
