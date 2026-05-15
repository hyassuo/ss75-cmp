import { effectiveStatus } from "@/lib/domain/effectiveStatus";
import { calcRate } from "@/lib/domain/calcRate";
import { isOverdue } from "@/lib/utils/format";
import type { ItemWithRelations } from "@/lib/types/domain";

// handoff 6.4
export function itemScore(item: ItemWithRelations): number {
  let s = 100;
  const eff = effectiveStatus(item);
  if (eff === "Critical") s -= 50;
  if (eff === "Attention") s -= 25;
  if (eff === "Overdue") s -= 40;
  if (eff === "Pending") s -= 15;
  if (isOverdue(item.next_insp)) s -= 30;
  if (!item.next_insp) s -= 20;
  if (!item.last_insp) s -= 10;
  const rate = calcRate(item.readings);
  if (rate !== null && rate > 0.5) s -= 25;
  return Math.max(0, s);
}

export function integrityColor(s: number | null): string {
  if (s === null) return "#7a95b0";
  if (s >= 80) return "#1e7e45";
  if (s >= 60) return "#a07c10";
  if (s >= 40) return "#c0591b";
  return "#c0392b";
}

export function integrityLabel(s: number | null): string {
  if (s === null) return "N/A";
  if (s >= 80) return "GOOD";
  if (s >= 60) return "FAIR";
  if (s >= 40) return "DEGRADED";
  return "CRITICAL";
}
