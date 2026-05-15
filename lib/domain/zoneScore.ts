import { itemScore } from "@/lib/domain/itemScore";
import type { ItemWithRelations } from "@/lib/types/domain";

// Weighted average — handoff 6.5. Needs >=2 items.
export function zoneScore(items: ItemWithRelations[]): number | null {
  if (!items || items.length < 2) return null;
  let totalWeight = 0;
  let weightedSum = 0;
  for (const it of items) {
    const pw =
      it.priority === "Critical"
        ? 1.4
        : it.priority === "High"
          ? 1.2
          : it.priority === "Medium"
            ? 1.0
            : 0.8;
    const sw = it.sece ? 1.5 : 1.0;
    const w = pw * sw;
    weightedSum += itemScore(it) * w;
    totalWeight += w;
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;
}
