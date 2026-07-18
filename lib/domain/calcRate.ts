import type { Reading } from "@/lib/types/domain";

// Corrosion-rate severity thresholds (mm/yr) — shared by rateColor,
// AlertBar and itemScore so the bands can never drift apart.
export const RATE_CRITICAL_MM_YR = 0.5;
export const RATE_ELEVATED_MM_YR = 0.2;

// Corrosion / pit growth rate in mm/year from readings (handoff 6.6).
export function calcRate(readings: Reading[] | null | undefined): number | null {
  if (!readings || readings.length < 2) return null;
  const sorted = [...readings].sort((a, b) =>
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
