"use client";

import { useState } from "react";
import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";
import { Badge } from "@/components/ui/Badge";
import { Gauge } from "@/components/ui/Gauge";
import { Button } from "@/components/ui/Button";
import { ItemCard } from "@/components/items/ItemCard";
import { useData } from "@/lib/context/DataContext";
import { useShell } from "@/lib/context/ShellContext";
import { isOverdue } from "@/lib/utils/format";
import { zoneScore } from "@/lib/domain/zoneScore";
import { integrityColor, integrityLabel } from "@/lib/domain/itemScore";
import { useLang } from "@/lib/context/LangContext";
import { tOr } from "@/lib/i18n/dict";

export function ZonesTab() {
  const { lang, t, tDept, tIntegrity } = useLang();
  const { zones, itemsByZone, subareasByZone, createItem } = useData();
  const { sysFilter, openItem } = useShell();
  const [creating, setCreating] = useState(false);

  const visibleZones =
    sysFilter === "All" ? zones : zones.filter((z) => z.system === sysFilter);

  async function addItem(zid: string) {
    if (creating) return;
    setCreating(true);
    const created = await createItem(zid, { status: "Pending" });
    setCreating(false);
    if (created) openItem(created.id, { isNew: true });
  }

  // Active items only, like each zone's own count below (archived ones are
  // shown per zone as "N archived").
  const totalItems = visibleZones.reduce(
    (a, z) => a + itemsByZone(z.zid).filter((i) => !i.archived).length,
    0
  );

  return (
    <div>
      <div style={{ fontSize: DS.fs.sm, color: DS.text3, marginBottom: 16 }}>
        {visibleZones.length} {visibleZones.length !== 1 ? t("dash.zones") : t("dash.zone")} ·{" "}
        {totalItems} {totalItems !== 1 ? t("dash.items") : t("dash.item")}
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
                        fontSize: DS.fs.base,
                        color: DS.blu,
                        fontWeight: 800,
                      }}
                    >
                      {z.zid}
                    </span>
                    <span
                      style={{
                        fontSize: DS.fs.xl,
                        fontWeight: 800,
                        color: DS.text,
                      }}
                    >
                      {z.name}
                    </span>
                    <Badge text={tDept(z.system)} color={DS.blu} sm />
                    {z.default_freq && (
                      <Badge
                        text={"DROPS: " + tOr(lang, `freq.${z.default_freq}`, z.default_freq)}
                        color={z.drops_zone ? DS.red : DS.text3}
                        sm
                      />
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: DS.fs.md,
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
                    <span style={{ fontSize: DS.fs.xs, color: DS.text3 }}>
                      {activeItems.length +
                        (activeItems.length !== 1 ? " " + t("dash.items") : " " + t("dash.item"))}
                    </span>
                    {sec > 0 && (
                      <Badge text={sec + " SECE"} color={DS.red} sm />
                    )}
                    {od > 0 && (
                      <Badge text={t("zones.overdue", od)} color={DS.red} sm />
                    )}
                    {archivedCount > 0 && (
                      <Badge
                        text={t("zones.archived", archivedCount)}
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
              <Button
                variant="secondary"
                onClick={() => void addItem(z.zid)}
                style={{ color: DS.blu, whiteSpace: "nowrap" }}
              >
                {t("nav.addItem")}
              </Button>
            </div>
            {activeItems.length > 0 &&
              (() => {
                // Group cards by sub-área. Items whose subarea_id is unset
                // (or points at another zone's sub-área: legacy data) fall
                // into the trailing "no sub-area" group. When nothing in
                // the zone uses sub-áreas, render the flat grid exactly as
                // before: zero visual change for units not using them.
                const zoneSubs = subareasByZone(z.zid);
                const bySub = new Map<string | null, typeof activeItems>();
                for (const it of activeItems) {
                  const key =
                    it.subarea_id &&
                    zoneSubs.some((s) => s.id === it.subarea_id)
                      ? it.subarea_id
                      : null;
                  const arr = bySub.get(key);
                  if (arr) arr.push(it);
                  else bySub.set(key, [it]);
                }
                const grid = (its: typeof activeItems) => (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill,minmax(min(280px,100%),1fr))",
                      minWidth: 0,
                      gap: 8,
                    }}
                  >
                    {its.map((it) => (
                      <ItemCard
                        key={it.id}
                        item={it}
                        onClick={() => openItem(it.id)}
                      />
                    ))}
                  </div>
                );
                const grouped = zoneSubs.filter((s) => bySub.has(s.id));
                if (!grouped.length) return grid(activeItems);
                return (
                  <div>
                    {grouped.map((s) => (
                      <div key={s.id} style={{ marginBottom: 12 }}>
                        <div
                          style={{
                            fontSize: DS.fs.sm,
                            color: DS.text3,
                            textTransform: "uppercase",
                            letterSpacing: 1.2,
                            fontWeight: 700,
                            marginBottom: 6,
                          }}
                        >
                          {s.name}{" "}
                          <span style={{ fontWeight: 400 }}>
                            ({bySub.get(s.id)!.length})
                          </span>
                        </div>
                        {grid(bySub.get(s.id)!)}
                      </div>
                    ))}
                    {bySub.has(null) && (
                      <div>
                        <div
                          style={{
                            fontSize: DS.fs.sm,
                            color: DS.text3,
                            textTransform: "uppercase",
                            letterSpacing: 1.2,
                            fontWeight: 700,
                            marginBottom: 6,
                          }}
                        >
                          {t("subarea.none")}{" "}
                          <span style={{ fontWeight: 400 }}>
                            ({bySub.get(null)!.length})
                          </span>
                        </div>
                        {grid(bySub.get(null)!)}
                      </div>
                    )}
                  </div>
                );
              })()}
          </div>
        );
      })}
    </div>
  );
}
