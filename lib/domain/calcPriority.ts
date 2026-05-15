import { daysUntil } from "@/lib/utils/format";
import type { ItemPriority } from "@/lib/types/domain";

// Priority = f(P×C, SECE weight, Overdue penalty) — handoff 6.1.
export function calcPriority(
  prob: number | null,
  cons: number | null,
  sece: boolean,
  nextInsp: string | null
): ItemPriority | null {
  if (!prob || !cons) return null;
  let weighted = prob * cons; // RPN base (1-25)
  weighted *= sece ? 1.5 : 1.0; // SECE weight
  const dd = daysUntil(nextInsp);
  if (dd !== null && dd < 0) weighted += 5; // overdue penalty
  else if (dd !== null && dd <= 30) weighted += 2; // due soon
  if (weighted >= 22) return "Critical";
  if (weighted >= 13) return "High";
  if (weighted >= 6) return "Medium";
  return "Low";
}
