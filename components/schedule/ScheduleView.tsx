"use client";

import { useState } from "react";
import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";
import { Badge } from "@/components/ui/Badge";
import { useData } from "@/lib/context/DataContext";
import { fmt, today, isOverdue, daysUntil } from "@/lib/utils/format";
import { calcRate, rateColor } from "@/lib/domain/calcRate";
import { PRIORITY_COLOR } from "@/lib/utils/constants";
import { useLang } from "@/lib/context/LangContext";
import type { ItemWithRelations } from "@/lib/types/domain";

type Row = ItemWithRelations & { zid: string; zname: string };

export function ScheduleView() {
  const { t, tPriority } = useLang();
  const { zones, itemsByZone } = useData();
  const [horizon, setHorizon] = useState(90);

  const allItems: Row[] = zones.flatMap((z) =>
    itemsByZone(z.zid).map((i) => ({ ...i, zid: z.zid, zname: z.name }))
  );

  const cutoff = new Date(today());
  cutoff.setDate(cutoff.getDate() + horizon);
  const cutStr = cutoff.toISOString().split("T")[0];

  const overdue = allItems
    .filter((i) => isOverdue(i.next_insp))
    .sort((a, b) => (a.next_insp || "").localeCompare(b.next_insp || ""));
  const upcoming = allItems
    .filter(
      (i) =>
        i.next_insp && !isOverdue(i.next_insp) && i.next_insp <= cutStr
    )
    .sort((a, b) => (a.next_insp || "").localeCompare(b.next_insp || ""));
  const noSched = allItems.filter((i) => !i.next_insp);

  function RowItem({ it, isOd }: { it: Row; isOd: boolean }) {
    const dd = daysUntil(it.next_insp) ?? 0;
    const rt = calcRate(it.readings);
    const rowColor = isOd
      ? DS.red
      : dd <= 14
        ? DS.ora
        : dd <= 30
          ? DS.yel
          : DS.text3;
    return (
      <div
        style={{
          background: DS.sur2,
          borderRadius: 8,
          padding: "11px 14px",
          marginBottom: 7,
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          borderLeft: "3px solid " + rowColor,
        }}
      >
        <div
          style={{
            fontFamily: "monospace",
            fontSize: 11,
            color: rowColor,
            minWidth: 80,
          }}
        >
          {isOd ? `-${-dd}d` : `${dd}d`}
        </div>
        <div
          style={{
            fontFamily: "monospace",
            fontSize: 11,
            color: DS.blu,
            minWidth: 34,
          }}
        >
          {it.zid}
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{ fontSize: 13, fontWeight: 700, color: DS.text }}
          >
            {it.name || it.id}
          </div>
          <div style={{ fontSize: 11, color: DS.text3 }}>
            {it.zname} | {it.freq_insp || "-"}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {it.priority && (
            <Badge
              text={tPriority(it.priority)}
              color={PRIORITY_COLOR[it.priority]}
              sm
            />
          )}
          {it.sece && <Badge text="SECE" color={DS.red} sm />}
          {it.ifs_wo && <Badge text={it.ifs_wo} color={DS.grn} sm />}
          {rt !== null && (
            <Badge
              text={rt.toFixed(2) + " mm/yr"}
              color={rateColor(rt)}
              sm
            />
          )}
        </div>
        <div
          style={{
            fontFamily: "monospace",
            fontSize: 11,
            color: DS.text3,
            minWidth: 72,
            textAlign: "right",
          }}
        >
          {fmt(it.next_insp)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 20,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 12, color: DS.text3, fontWeight: 600 }}>{t("sched.horizon")}</div>
        {[30, 60, 90, 180].map((h) => (
          <button
            key={h}
            onClick={() => setHorizon(h)}
            style={{
              background: horizon === h ? DS.bord : "transparent",
              color: horizon === h ? DS.blu : DS.text3,
              border: "1px solid " + DS.bord,
              borderRadius: 20,
              padding: "5px 16px",
              fontSize: 12,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {h} days
          </button>
        ))}
        <div style={{ fontSize: 11, color: DS.text3, marginLeft: 8 }}>
          {t("sched.until")} {fmt(cutStr)}
        </div>
      </div>

      {overdue.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 11,
              color: DS.red,
              textTransform: "uppercase",
              letterSpacing: 1.5,
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            {t("sched.overdue")} ({overdue.length})
          </div>
          {overdue.map((it) => (
            <RowItem key={it.id} it={it} isOd />
          ))}
        </div>
      )}

      {upcoming.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 11,
              color: DS.ora,
              textTransform: "uppercase",
              letterSpacing: 1.5,
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            {t("sched.dueIn")} {horizon} {t("sched.days")} ({upcoming.length})
          </div>
          {upcoming.map((it) => (
            <RowItem key={it.id} it={it} isOd={false} />
          ))}
        </div>
      )}

      {!overdue.length && !upcoming.length && (
        <div
          style={{
            ...S.card,
            textAlign: "center",
            padding: "40px 24px",
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 14, color: DS.grn, fontWeight: 600 }}>
            {t("sched.allClear", horizon)}
          </div>
        </div>
      )}

      {noSched.length > 0 && (
        <div style={S.card}>
          <div
            style={{
              fontSize: 11,
              color: DS.text3,
              textTransform: "uppercase",
              letterSpacing: 1.5,
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            {t("sched.notScheduled")} ({noSched.length})
          </div>
          <div
            style={{ display: "flex", flexWrap: "wrap", gap: 7 }}
          >
            {noSched.map((it) => (
              <div
                key={it.id}
                style={{
                  background: DS.sur2,
                  borderRadius: 7,
                  padding: "8px 12px",
                  fontSize: 12,
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: 10,
                    color: DS.blu,
                  }}
                >
                  {it.zid}
                </span>
                <span style={{ color: DS.text3 }}>{it.name || it.id}</span>
                {it.sece && <Badge text="SECE" color={DS.red} sm />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
