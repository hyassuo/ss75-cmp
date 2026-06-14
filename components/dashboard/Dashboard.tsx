"use client";

import type { CSSProperties } from "react";
import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";
import { Badge } from "@/components/ui/Badge";
import { Gauge } from "@/components/ui/Gauge";
import { useData } from "@/lib/context/DataContext";
import { useShell } from "@/lib/context/ShellContext";
import { useLang } from "@/lib/context/LangContext";
import { isOverdue, daysUntil } from "@/lib/utils/format";
import {
  itemScore,
  integrityColor,
  integrityLabel,
} from "@/lib/domain/itemScore";
import { zoneScore } from "@/lib/domain/zoneScore";
import { PRIORITY_COLOR } from "@/lib/utils/constants";
import type { ItemPriority, ItemWithRelations } from "@/lib/types/domain";

function priorityWeight(it: ItemWithRelations): number {
  const pw =
    it.priority === "Critical"
      ? 1.4
      : it.priority === "High"
        ? 1.2
        : it.priority === "Medium"
          ? 1.0
          : 0.8;
  return pw * (it.sece ? 1.5 : 1.0);
}

export function Dashboard() {
  const { zones, itemsByZone } = useData();
  const { sysFilter, setTab } = useShell();
  const { t, tIntegrity, tPriority } = useLang();

  const visibleZones =
    sysFilter === "All" ? zones : zones.filter((z) => z.system === sysFilter);
  const allItems = visibleZones.flatMap((z) => itemsByZone(z.zid));
  const total = allItems.length;

  if (!total) {
    return (
      <div
        style={{ ...S.card, textAlign: "center", padding: "48px 24px" }}
      >
        <div style={{ fontSize: 32, marginBottom: 12 }}>⊕</div>
        <div
          style={{
            fontSize: 15,
            color: DS.text3,
            fontWeight: 600,
            marginBottom: 6,
          }}
        >
          {t("dash.noItems")}
        </div>
        <div style={{ fontSize: 13, color: DS.text3, marginBottom: 20 }}>
          {t("dash.noItemsCta")}
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {visibleZones.map((z) => (
            <button
              key={z.zid}
              onClick={() => setTab("zones")}
              style={{
                background: DS.sur,
                border: "1px solid " + DS.bord,
                borderRadius: 8,
                padding: "8px 14px",
                cursor: "pointer",
                fontSize: 12,
                color: DS.blu,
                fontWeight: 600,
                display: "flex",
                gap: 6,
                alignItems: "center",
              }}
            >
              <span
                style={{ fontFamily: DS.mono, fontSize: 10, color: DS.text3 }}
              >
                {z.zid}
              </span>
              {z.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const withInsp = allItems.filter((i) => i.last_insp).length;
  const overdue = allItems.filter((i) => isOverdue(i.next_insp)).length;
  const due30 = allItems.filter((i) => {
    const d = daysUntil(i.next_insp);
    return d !== null && d >= 0 && d <= 30;
  }).length;
  const seceItems = allItems.filter((i) => i.sece);
  const critItems = allItems.filter((i) => i.priority === "Critical");
  const withSched = allItems.filter((i) => i.next_insp).length;
  const schedC =
    withSched > 0 ? Math.round(((withSched - overdue) / withSched) * 100) : 100;
  const compliance = Math.round((withInsp / total) * 100);

  const tw = allItems.reduce((a, it) => a + priorityWeight(it), 0);
  const gi =
    tw > 0
      ? Math.round(
          allItems.reduce(
            (a, it) => a + itemScore(it) * priorityWeight(it),
            0
          ) / tw
        )
      : null;

  const seceOK = seceItems.filter((i) => i.status === "OK").length;
  const critOK = critItems.filter((i) => i.status === "OK").length;

  const kpis: Array<{
    label: string;
    v: string;
    sub: string;
    color: string;
    gauge?: number | null;
  }> = [
    {
      label: t("dash.integrityIndex"),
      v: gi !== null ? `${gi}` : "N/A",
      sub: tIntegrity(integrityLabel(gi)),
      color: integrityColor(gi),
      gauge: gi,
    },
    {
      label: t("dash.inspectionCompliance"),
      v: compliance + "%",
      sub: `${withInsp}/${total} ${t("dash.inspected")}`,
      color: compliance >= 80 ? DS.grn : compliance >= 60 ? DS.yel : DS.red,
    },
    {
      label: t("dash.scheduleCompliance"),
      v: schedC + "%",
      sub: t("dash.overdueDue30", overdue, due30),
      color: schedC >= 90 ? DS.grn : schedC >= 70 ? DS.yel : DS.red,
    },
    {
      label: t("dash.seceOk"),
      v:
        (seceItems.length
          ? Math.round((seceOK / seceItems.length) * 100)
          : 100) + "%",
      sub: `${seceOK}/${seceItems.length} SECE`,
      color: DS.red,
    },
    {
      label: t("dash.criticalItemsOk"),
      v:
        (critItems.length
          ? Math.round((critOK / critItems.length) * 100)
          : 100) + "%",
      sub: `${critOK}/${critItems.length} ${t("priority.Critical").toLowerCase()}`,
      color: DS.ora,
    },
  ];

  const gridAuto: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))",
    gap: 12,
  };

  const priorities: ItemPriority[] = ["Critical", "High", "Medium", "Low"];

  return (
    <div>
      <div style={{ ...gridAuto, marginBottom: 20 }}>
        {kpis.map((k) => (
          <div
            key={k.label}
            style={{ ...S.card, display: "flex", gap: 12, alignItems: "center" }}
          >
            {k.gauge !== undefined && <Gauge score={k.gauge} size={52} />}
            <div>
              <div
                style={{
                  fontSize: 9,
                  color: DS.text3,
                  textTransform: "uppercase",
                  letterSpacing: 1.2,
                  marginBottom: 3,
                }}
              >
                {k.label}
              </div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: k.color,
                  fontFamily: "monospace",
                  lineHeight: 1,
                }}
              >
                {k.v}
              </div>
              <div
                style={{ fontSize: 10, color: DS.text3, marginTop: 3 }}
              >
                {k.sub}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ ...S.card, marginBottom: 16 }}>
        <div
          style={{
            fontSize: 11,
            color: DS.text3,
            textTransform: "uppercase",
            letterSpacing: 1.5,
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          {t("dash.byZone")}{" "}
          <span style={{ fontSize: 9, fontWeight: 400 }}>
            {t("dash.weightedNote")}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {visibleZones.map((z) => {
            const items = itemsByZone(z.zid);
            const sc = zoneScore(items);
            const c = integrityColor(sc);
            const pct = sc || 0;
            return (
              <div
                key={z.zid}
                style={{
                  padding: "6px 0",
                  borderBottom: "1px solid #f1f5f9",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 5,
                  }}
                >
                  <span
                    style={{
                      fontFamily: DS.mono,
                      fontSize: 10,
                      color: DS.blu,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {z.zid}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: DS.text,
                      fontWeight: 600,
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {z.name}
                  </span>
                  <span
                    style={{
                      fontFamily: DS.mono,
                      fontSize: 12,
                      color: c,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {sc !== null ? sc : "-"}
                  </span>
                  <Badge text={tIntegrity(integrityLabel(sc))} color={c} sm />
                  <span
                    style={{ fontSize: 10, color: DS.text3, flexShrink: 0 }}
                  >
                    {items.length} {items.length !== 1 ? t("dash.items") : t("dash.item")}
                  </span>
                </div>
                <div
                  style={{
                    width: "100%",
                    background: DS.sur2,
                    borderRadius: 4,
                    height: 6,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: pct + "%",
                      height: "100%",
                      background: c,
                      borderRadius: 4,
                      transition: "width 0.4s ease",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        {/* No "needs 2+ items" footnote anymore — zoneScore now handles
            single-item zones, so the asterisk legend is no longer needed. */}
      </div>

      <div style={gridAuto}>
        {priorities.map((p) => {
          const its = allItems.filter((i) => i.priority === p);
          const sc = zoneScore(its);
          return (
            <div
              key={p}
              style={{ ...S.card, borderLeft: "3px solid " + PRIORITY_COLOR[p] }}
            >
              <div
                style={{ display: "flex", gap: 12, alignItems: "center" }}
              >
                <Gauge score={sc} size={46} />
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: PRIORITY_COLOR[p],
                      fontWeight: 700,
                      marginBottom: 2,
                    }}
                  >
                    {tPriority(p)}
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      color: DS.text,
                      fontFamily: "monospace",
                      lineHeight: 1,
                    }}
                  >
                    {its.length}
                    <span
                      style={{
                        fontSize: 10,
                        color: DS.text3,
                        marginLeft: 4,
                      }}
                    >
                      {t("dash.items")}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: DS.text3 }}>
                    {its.filter((i) => i.sece).length} SECE
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
