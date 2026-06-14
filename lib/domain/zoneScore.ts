import { itemScore } from "@/lib/domain/itemScore";
import type { ItemWithRelations } from "@/lib/types/domain";

// Weighted average of itemScore by priority × SECE.
// Returns null only for empty zones. A zone with a single item shows that
// item's effective score — surfacing a 1-of-1 CRITICAL is more useful than
// hiding it behind "N/A". (The original handoff §6.5 required ≥2 items as
// a "statistically meaningful" floor; for an operational dashboard the
// floor of 1 is the right call.)
export function zoneScore(items: ItemWithRelations[]): number | null {
  if (!items || items.length === 0) return null;
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
