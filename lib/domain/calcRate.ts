import { DS } from "@/lib/design/tokens";
import type { Reading } from "@/lib/types/domain";

// Corrosion-rate severity thresholds (mm/yr) — shared by rateColor,
// AlertBar and itemScore so the bands can never drift apart.
export const RATE_CRITICAL_MM_YR = 0.5;
export const RATE_ELEVATED_MM_YR = 0.2;

// Pit-depth estimates staged from the AI photo analysis are saved as a
// reading tagged like this (ItemModal.save). They are a visual guess, not a
// measurement, and must never drive the corrosion rate: a 0.3 mm estimate
// followed a month later by a 1.5 mm UT reading would read as 14.6 mm/yr.
export const AI_READING_CHECKED_BY = "AI Vision";
export const AI_READING_LOCATION = "AI estimate";
export function isAiEstimate(r: Pick<Reading, "checked_by" | "location">): boolean {
  return r.checked_by === AI_READING_CHECKED_BY && r.location === AI_READING_LOCATION;
}

// Readings closer together than this say more about measurement scatter
// than about corrosion: 0.1 mm of scatter over 30 days reads as 1.2 mm/yr.
export const RATE_MIN_SPAN_DAYS = 90;

const DAY_MS = 86_400_000;
const days = (a: string, b: string) =>
  (new Date(b).getTime() - new Date(a).getTime()) / DAY_MS;

// Corrosion / pit growth rate in mm/year (handoff 6.6), from measured
// readings only — AI estimates are ignored. Readings are compared only at
// the same measuring point (location, case/space-insensitive; blank counts
// as one point) and only when at least RATE_MIN_SPAN_DAYS apart. Per point
// the long-term rate (first → latest) and the short-term rate (latest vs
// the newest reading at least the minimum span earlier) are computed and
// the worse one counts; the item's rate is its worst point. null =
// insufficient data (no alert).
export function calcRate(readings: Reading[] | null | undefined): number | null {
  const byPoint = new Map<string, Reading[]>();
  for (const r of readings ?? []) {
    if (isAiEstimate(r)) continue;
    const key = (r.location ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    const list = byPoint.get(key);
    if (list) list.push(r);
    else byPoint.set(key, [r]);
  }
  let worst: number | null = null;
  for (const list of byPoint.values()) {
    // Same-day readings: the one recorded last counts as the latest.
    const sorted = [...list].sort(
      (a, b) =>
        a.reading_date.localeCompare(b.reading_date) ||
        (a.created_at ?? "").localeCompare(b.created_at ?? "")
    );
    const last = sorted[sorted.length - 1];
    const earlier = sorted.filter(
      (r) => days(r.reading_date, last.reading_date) >= RATE_MIN_SPAN_DAYS
    );
    if (!earlier.length) continue;
    for (const from of [earlier[0], earlier[earlier.length - 1]]) {
      const rate =
        ((last.depth_mm - from.depth_mm) /
          days(from.reading_date, last.reading_date)) *
        365;
      const clamped = rate > 0 ? rate : 0;
      if (worst === null || clamped > worst) worst = clamped;
    }
  }
  return worst;
}

export function rateColor(r: number | null): string {
  if (r === null) return DS.text3;
  if (r > RATE_CRITICAL_MM_YR) return DS.red;
  if (r > RATE_ELEVATED_MM_YR) return DS.ora;
  if (r > 0) return DS.yel;
  return DS.grn;
}
