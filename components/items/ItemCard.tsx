"use client";

import { DS } from "@/lib/design/tokens";
import { Badge } from "@/components/ui/Badge";
import { Gauge } from "@/components/ui/Gauge";
import { fmt, isOverdue, daysUntil } from "@/lib/utils/format";
import { itemScore } from "@/lib/domain/itemScore";
import { effectiveStatus } from "@/lib/domain/effectiveStatus";
import { calcRate, rateColor } from "@/lib/domain/calcRate";
import { PRIORITY_COLOR, STATUS_COLOR } from "@/lib/utils/constants";
import type { ItemWithRelations } from "@/lib/types/domain";

export function ItemCard({
  item,
  onClick,
}: {
  item: ItemWithRelations;
  onClick: () => void;
}) {
  const sc = itemScore(item);
  const rt = calcRate(item.readings);
  const dd = daysUntil(item.next_insp);
  const eff = effectiveStatus(item);

  return (
    <div
      onClick={onClick}
      style={{
        background: DS.sur2,
        borderRadius: 8,
        padding: "12px 14px",
        borderLeft:
          "3px solid " +
          ((item.priority && PRIORITY_COLOR[item.priority]) || DS.bord),
        cursor: "pointer",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <Gauge score={sc} size={38} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: DS.text,
            marginBottom: 4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.name || "(unnamed)"}
        </div>
        {item.ifs_obj_id && (
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 10,
              color: DS.grn,
              marginBottom: 4,
            }}
          >
            {item.ifs_obj_id} -{" "}
            {(item.ifs_obj_desc || "").slice(0, 30)}
            {(item.ifs_obj_desc || "").length > 30 ? "..." : ""}
          </div>
        )}
        <div
          style={{
            display: "flex",
            gap: 5,
            flexWrap: "wrap",
            marginBottom: 4,
          }}
        >
          {item.priority && (
            <Badge
              text={item.priority}
              color={PRIORITY_COLOR[item.priority]}
              sm
            />
          )}
          <Badge text={eff} color={STATUS_COLOR[eff] || DS.text3} sm />
          {item.sece && <Badge text="SECE" color={DS.red} sm />}
          {rt !== null && (
            <Badge
              text={rt.toFixed(2) + "mm/yr"}
              color={rateColor(rt)}
              sm
            />
          )}
          {item.evidences.length > 0 && (
            <Badge
              text={item.evidences.length + " ev."}
              color={DS.vio}
              sm
            />
          )}
        </div>
        <div
          style={{
            fontSize: 10,
            color: isOverdue(item.next_insp)
              ? DS.red
              : dd !== null && dd <= 30
                ? DS.ora
                : DS.text3,
          }}
        >
          {isOverdue(item.next_insp)
            ? "OVERDUE "
            : dd !== null && dd <= 30
              ? dd + "d → "
              : ""}
          {fmt(item.next_insp)}
        </div>
      </div>
    </div>
  );
}
