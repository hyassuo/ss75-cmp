import { daysUntil } from "@/lib/utils/format";
import type { ItemPriority } from "@/lib/types/domain";

// Priority = f(P×C, SECE weight, DROPS/Structural bonus, Overdue penalty).
//
// Multipliers/penalties combine on top of the raw RPN. SECE is the biggest
// lever (×1.5) because it's the official Safety & Environmental Critical
// Element flag from IFS; DROPS and Structural add a smaller absolute bump
// each since they capture additional contributing risk (drops potential,
// structural integrity) without being part of the SECE definition.
//
// Thresholds: <6 Low · 6-12 Medium · 13-21 High · ≥22 Critical.
export function calcPriority(
  prob: number | null,
  cons: number | null,
  sece: boolean,
  nextInsp: string | null,
  dropsRisk: boolean = false,
  structural: boolean = false
): ItemPriority | null {
  if (!prob || !cons) return null;
  let weighted = prob * cons; // RPN base (1-25)
  weighted *= sece ? 1.5 : 1.0; // SECE weight (multiplicative)
  if (dropsRisk) weighted += 2; // DROPS contributing factor (additive)
  if (structural) weighted += 2; // Structural element contributing factor
  const dd = daysUntil(nextInsp);
  if (dd !== null && dd < 0) weighted += 5; // overdue penalty
  else if (dd !== null && dd <= 30) weighted += 2; // due soon
  if (weighted >= 22) return "Critical";
  if (weighted >= 13) return "High";
  if (weighted >= 6) return "Medium";
  return "Low";
}
