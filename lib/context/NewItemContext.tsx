"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { DS } from "@/lib/design/tokens";
import { useData } from "@/lib/context/DataContext";
import { useShell } from "@/lib/context/ShellContext";
import { ItemModal } from "@/components/items/ItemModal";

interface NewItemState {
  openNewItem: () => void;
}

const NewItemContext = createContext<NewItemState | null>(null);

interface OpenItem {
  itemId: string;
  zoneName: string;
}

export function NewItemProvider({ children }: { children: ReactNode }) {
  const { zones, createItem } = useData();
  const { sysFilter, sidebarCollapsed } = useShell();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<OpenItem | null>(null);

  const visibleZones =
    sysFilter === "All" ? zones : zones.filter((z) => z.system === sysFilter);

  async function choose(zid: string, zoneName: string) {
    if (busy) return;
    setBusy(true);
    const created = await createItem(zid, { status: "Pending" });
    setBusy(false);
    setPicking(false);
    if (created) setOpen({ itemId: created.id, zoneName });
  }

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
            onClick={(e) => e.stopPropagation()}
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
                fontSize: 11,
                color: DS.text3,
                textTransform: "uppercase",
                letterSpacing: 1,
                fontWeight: 700,
                borderBottom: "1px solid " + DS.bord,
              }}
            >
              New Item — select a zone
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {visibleZones.map((z) => (
                <div
                  key={z.zid}
                  onClick={() => void choose(z.zid, z.name)}
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
                      fontSize: 10,
                      color: DS.blu,
                      minWidth: 30,
                    }}
                  >
                    {z.zid}
                  </span>
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: DS.text,
                      }}
                    >
                      {z.name}
                    </div>
                    <div style={{ fontSize: 10, color: DS.text3 }}>
                      {z.system}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {open && (
        <ItemModal
          itemId={open.itemId}
          zoneName={open.zoneName}
          isNew
          onClose={() => setOpen(null)}
        />
      )}
    </NewItemContext.Provider>
  );
}

export function useNewItem(): NewItemState {
  const ctx = useContext(NewItemContext);
  if (!ctx) throw new Error("useNewItem must be used within NewItemProvider");
  return ctx;
}
