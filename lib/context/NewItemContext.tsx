"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { DS } from "@/lib/design/tokens";
import { useData } from "@/lib/context/DataContext";
import { useShell } from "@/lib/context/ShellContext";
import { useLang } from "@/lib/context/LangContext";
import { pressable } from "@/lib/utils/a11y";

interface NewItemState {
  openNewItem: () => void;
}

const NewItemContext = createContext<NewItemState | null>(null);

export function NewItemProvider({ children }: { children: ReactNode }) {
  const { zones, createItem } = useData();
  const { sysFilter, sidebarCollapsed, openItem } = useShell();
  const { t } = useLang();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const visibleZones =
    sysFilter === "All" ? zones : zones.filter((z) => z.system === sysFilter);

  async function choose(zid: string) {
    if (busy) return;
    setBusy(true);
    try {
      const created = await createItem(zid, { status: "Pending" });
      setPicking(false);
      if (created) openItem(created.id, { isNew: true });
    } finally {
      setBusy(false);
    }
  }

  // Keyboard users land on the first zone.
  useEffect(() => {
    if (!picking) return;
    document
      .querySelector<HTMLElement>(".zone-picker [role=button]")
      ?.focus();
  }, [picking]);

  return (
    <NewItemContext.Provider value={{ openNewItem: () => setPicking(true) }}>
      {children}

      {picking && (
        <div
          onClick={() => setPicking(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "transparent",
            zIndex: 600,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("newItem.pickZone")}
            className="zone-picker"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setPicking(false);
            }}
            style={{
              position: "fixed",
              left: sidebarCollapsed ? 64 : 204,
              top: 116,
              bottom: 24,
              width: 340,
              maxWidth: "calc(100vw - 32px)",
              background: DS.sur,
              border: "1px solid " + DS.bord,
              borderRadius: 10,
              boxShadow: "0 12px 40px rgba(0,0,0,0.22)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                fontSize: DS.fs.sm,
                color: DS.text3,
                textTransform: "uppercase",
                letterSpacing: 1,
                fontWeight: 700,
                borderBottom: "1px solid " + DS.bord,
              }}
            >
              {t("newItem.pickZone")}
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {visibleZones.map((z) => (
                <div
                  key={z.zid}
                  {...pressable(() => void choose(z.zid))}
                  style={{
                    padding: "10px 16px",
                    cursor: busy ? "default" : "pointer",
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    borderBottom: "1px solid " + DS.sur2,
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  <span
                    style={{
                      fontFamily: DS.mono,
                      fontSize: DS.fs.xs,
                      color: DS.blu,
                      minWidth: 30,
                    }}
                  >
                    {z.zid}
                  </span>
                  <div>
                    <div
                      style={{
                        fontSize: DS.fs.md,
                        fontWeight: 600,
                        color: DS.text,
                      }}
                    >
                      {z.name}
                    </div>
                    <div style={{ fontSize: DS.fs.xs, color: DS.text3 }}>
                      {z.system}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </NewItemContext.Provider>
  );
}

export function useNewItem(): NewItemState {
  const ctx = useContext(NewItemContext);
  if (!ctx) throw new Error("useNewItem must be used within NewItemProvider");
  return ctx;
}
