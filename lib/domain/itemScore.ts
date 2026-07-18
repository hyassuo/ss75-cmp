import { calcRate, RATE_CRITICAL_MM_YR } from "@/lib/domain/calcRate";
import { isOverdue } from "@/lib/utils/format";
import type { ItemWithRelations } from "@/lib/types/domain";

// handoff 6.4 — status penalty + a single overdue penalty. Overdue used to
// be counted twice (once via effectiveStatus mapping to "Overdue", once via
// the raw isOverdue check), and an overdue item's own status penalty was
// swallowed by that mapping. Now: the stored status always contributes, and
// being past the next-inspection date costs a flat 40 on top.
export function itemScore(item: ItemWithRelations): number {
  let s = 100;
  if (item.status === "Critical") s -= 50;
  if (item.status === "Attention") s -= 25;
  if (item.status === "Pending") s -= 15;
  if (isOverdue(item.next_insp)) s -= 40;
  if (!item.next_insp) s -= 20;
  if (!item.last_insp) s -= 10;
  const rate = calcRate(item.readings);
  if (rate !== null && rate > RATE_CRITICAL_MM_YR) s -= 25;
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
