import type { Item, ItemPriority } from "@/lib/types/domain";
import { addDays } from "@/lib/utils/format";

// Suggested tratativa deadline, driven by OUR priority (P×C + SECE +
// readings): not by the FM-116-OFF band matrix. Advisory only: the UI
// pre-fills the date and the user can edit it freely.
export const ACTION_DUE_DAYS: Record<ItemPriority, number> = {
  Critical: 90,
  High: 180,
  Medium: 365,
  Low: 1095,
};

// Time-zone-independent calendar math (see addDays).
export function suggestActionDue(
  priority: ItemPriority | null,
  fromDate: string
): string | null {
  if (!priority) return null;
  return addDays(fromDate, ACTION_DUE_DAYS[priority]);
}

type ActionFields = Pick<Item, "action_type" | "action_status">;
type ActionDueFields = Pick<Item, "action_type" | "action_due" | "action_status">;

// Open action = a tratativa exists and is not done. A null status counts
// as open ("Sem planejamento" is the implicit default).
export function isActionOpen(it: ActionFields): boolean {
  return !!it.action_type && it.action_status !== "Executado";
}

// Overdue action = due date passed and not done. Due today is NOT overdue
// (same strict `<` semantics as isOverdue in lib/utils/format.ts).
// todayStr is injected (YYYY-MM-DD) for testability.
export function isActionOverdue(it: ActionDueFields, todayStr: string): boolean {
  return isActionOpen(it) && !!it.action_due && it.action_due < todayStr;
}
