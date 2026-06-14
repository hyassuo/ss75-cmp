"use client";

import { useState } from "react";
import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";
import { Badge } from "@/components/ui/Badge";
import { Gauge } from "@/components/ui/Gauge";
import { ItemCard } from "@/components/items/ItemCard";
import { ItemModal } from "@/components/items/ItemModal";
import { useData } from "@/lib/context/DataContext";
import { useShell } from "@/lib/context/ShellContext";
import { isOverdue } from "@/lib/utils/format";
import { zoneScore } from "@/lib/domain/zoneScore";
import { integrityColor, integrityLabel } from "@/lib/domain/itemScore";
import { useLang } from "@/lib/context/LangContext";

interface Open {
  itemId: string;
  zoneName: string;
  isNew: boolean;
}

export function ZonesTab() {
  const { t, tDept, tIntegrity } = useLang();
  const { zones, itemsByZone, createItem } = useData();
  const { sysFilter } = useShell();
  const [open, setOpen] = useState<Open | null>(null);
  const [creating, setCreating] = useState(false);

  const visibleZones =
    sysFilter === "All" ? zones : zones.filter((z) => z.system === sysFilter);

  async function addItem(zid: string, zoneName: string) {
    if (creating) return;
    setCreating(true);
    const created = await createItem(zid, { status: "Pending" });
    setCreating(false);
    if (created) {
      setOpen({ itemId: created.id, zoneName, isNew: true });
    }
  }

  const totalItems = visibleZones.reduce(
    (a, z) => a + itemsByZone(z.zid).length,
    0
  );

  return (
    <div>
      <div style={{ fontSize: 11, color: DS.text3, marginBottom: 16 }}>
        {visibleZones.length} {visibleZones.length !== 1 ? t("dash.items") : t("dash.item")} · {totalItems} items
      </div>

      {visibleZones.map((z) => {
        const items = itemsByZone(z.zid);
        const activeItems = items.filter((i) => !i.archived);
        const archivedCount = items.length - activeItems.length;
        const sc = zoneScore(activeItems);
        const od = activeItems.filter((i) => isOverdue(i.next_insp)).length;
        const sec = activeItems.filter((i) => i.sece).length;

        return (
          <div key={z.zid} style={{ ...S.card, marginBottom: 14 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: items.length ? 16 : 0,
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <div
                style={{ display: "flex", gap: 14, alignItems: "center" }}
              >
                <Gauge score={sc} size={52} />
                <div>
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "baseline",
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontSize: 13,
                        color: DS.blu,
                        fontWeight: 800,
                      }}
                    >
                      {z.zid}
                    </span>
                    <span
                      style={{
                        fontSize: 16,
                        fontWeight: 800,
                        color: DS.text,
                      }}
                    >
                      {z.name}
                    </span>
                    <Badge text={tDept(z.system)} color={DS.blu} sm />
                    {z.default_freq && (
                      <Badge
                        text={"DROPS: " + z.default_freq}
                        color={z.drops_zone ? DS.red : DS.text3}
                        sm
                      />
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: DS.text3,
                      marginTop: 3,
                    }}
                  >
                    {z.description}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginTop: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontSize: 10, color: DS.text3 }}>
                      {activeItems.length +
                        (activeItems.length !== 1 ? " " + t("dash.items") : " " + t("dash.item"))}
                    </span>
                    {sec > 0 && (
                      <Badge text={sec + " SECE"} color={DS.red} sm />
                    )}
                    {od > 0 && (
                      <Badge text={od + " overdue"} color={DS.red} sm />
                    )}
                    {archivedCount > 0 && (
                      <Badge
                        text={archivedCount + " archived"}
                        color={DS.text3}
                        sm
                      />
                    )}
                    {sc !== null && (
                      <Badge
                        text={tIntegrity(integrityLabel(sc))}
                        color={integrityColor(sc)}
                        sm
                      />
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => void addItem(z.zid, z.name)}
                style={{
                  background: DS.sur2,
                  color: DS.blu,
                  border: "1px solid " + DS.bord,
                  borderRadius: 8,
                  padding: "8px 18px",
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >{t("nav.addItem")}</button>
            </div>
            {activeItems.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))",
                  gap: 8,
                }}
              >
                {activeItems.map((it) => (
                  <ItemCard
                    key={it.id}
                    item={it}
                    onClick={() =>
                      setOpen({
                        itemId: it.id,
                        zoneName: z.name,
                        isNew: false,
                      })
                    }
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {open && (
        <ItemModal
          itemId={open.itemId}
          zoneName={open.zoneName}
          isNew={open.isNew}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
