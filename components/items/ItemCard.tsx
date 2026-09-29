"use client";

import { DS } from "@/lib/design/tokens";
import { Badge } from "@/components/ui/Badge";
import { useLang } from "@/lib/context/LangContext";
import { Gauge } from "@/components/ui/Gauge";
import { fmt, fmtNum, isOverdue, daysUntil, today } from "@/lib/utils/format";
import { itemScore } from "@/lib/domain/itemScore";
import { effectiveStatus } from "@/lib/domain/effectiveStatus";
import { calcRate, rateColor } from "@/lib/domain/calcRate";
import { isActionOpen, isActionOverdue } from "@/lib/domain/actionPlan";
import { PRIORITY_COLOR, STATUS_COLOR } from "@/lib/utils/constants";
import type { ItemWithRelations } from "@/lib/types/domain";
import { effectivePriority } from "@/lib/domain/calcPriority";
import { pressable } from "@/lib/utils/a11y";

export function ItemCard({
  item,
  onClick,
}: {
  item: ItemWithRelations;
  onClick: () => void;
}) {
  const { lang, t, tPriority, tStatus } = useLang();
  const priority = effectivePriority(item);
  const sc = itemScore(item);
  const rt = calcRate(item.readings);
  const dd = daysUntil(item.next_insp);
  const eff = effectiveStatus(item);

  return (
    <div
      {...pressable(onClick)}
      style={{
        background: DS.sur2,
        borderRadius: 8,
        padding: "12px 14px",
        borderLeft:
          "3px solid " +
          ((priority && PRIORITY_COLOR[priority]) || DS.bord),
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
            fontSize: DS.fs.base,
            fontWeight: 700,
            color: DS.text,
            marginBottom: 4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.name || t("modal.untitled")}
        </div>
        {item.ifs_obj_id && (
          <div
            style={{
              fontFamily: "monospace",
              fontSize: DS.fs.xs,
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
          {priority && (
            <Badge
              text={tPriority(priority)}
              color={PRIORITY_COLOR[priority]}
              sm
            />
          )}
          <Badge text={tStatus(eff)} color={STATUS_COLOR[eff] || DS.text3} sm />
          {item.sece && <Badge text="SECE" color={DS.red} sm />}
          {item.is_accessory && (
            <Badge
              text={item.accessory_type || t("f.isAccessory")}
              color={DS.blu}
              sm
            />
          )}
          {isActionOpen(item) && (
            <Badge
              text={t("badge.action")}
              color={isActionOverdue(item, today()) ? DS.red : DS.ora}
              sm
            />
          )}
          {rt !== null && (
            <Badge
              text={fmtNum(rt, lang, 2) + "mm/yr"}
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
            fontSize: DS.fs.xs,
            color: isOverdue(item.next_insp)
              ? DS.red
              : dd !== null && dd <= 30
                ? DS.ora
                : DS.text3,
          }}
        >
          {isOverdue(item.next_insp)
            ? tStatus("Overdue").toUpperCase() + " "
            : dd !== null && dd <= 30
              ? dd + "d → "
              : ""}
          {fmt(item.next_insp, lang)}
        </div>
      </div>
    </div>
  );
}
