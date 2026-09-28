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

// Corrosion / pit growth rate in mm/year from measured readings (handoff
// 6.6). AI estimates are ignored.
export function calcRate(readings: Reading[] | null | undefined): number | null {
  const measured = (readings ?? []).filter((r) => !isAiEstimate(r));
  if (measured.length < 2) return null;
  const sorted = [...measured].sort((a, b) =>
    a.reading_date.localeCompare(b.reading_date)
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const days =
    (new Date(last.reading_date).getTime() -
      new Date(first.reading_date).getTime()) /
    86_400_000;
  if (days <= 0) return null;
  const rate = ((last.depth_mm - first.depth_mm) / days) * 365;
  return rate > 0 ? rate : 0;
}

export function rateColor(r: number | null): string {
  if (r === null) return "#7a95b0";
  if (r > RATE_CRITICAL_MM_YR) return "#c0392b";
  if (r > RATE_ELEVATED_MM_YR) return "#c0591b";
  if (r > 0) return "#a07c10";
  return "#1e7e45";
}
