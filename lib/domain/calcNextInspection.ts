import type { InspectionFrequency } from "@/lib/types/domain";

export const FREQ_DAYS: Record<InspectionFrequency, number | null> = {
  Weekly: 7,
  Monthly: 30,
  Quarterly: 91,
  "Semi-annual": 182,
  Annual: 365,
  "Every 2 years": 730,
  "Every 2.5 years": 912,
  "Every 5 years": 1825,
  "Per operation": null,
  "As required": null,
};

// handoff 6.3 — runs client-side whenever last_insp or freq_insp changes.
export function calcNextInspection(
  lastInsp: string | null,
  freq: InspectionFrequency | null
): string | null {
  if (!lastInsp || !freq) return null;
  const days = FREQ_DAYS[freq];
  if (!days) return null;
  const d = new Date(lastInsp);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
