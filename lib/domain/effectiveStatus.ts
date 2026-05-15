import { isOverdue } from "@/lib/utils/format";
import type { EffectiveStatus, Item } from "@/lib/types/domain";

// 'Overdue' is never stored — computed every render (handoff 6.2).
export function effectiveStatus(item: Item): EffectiveStatus {
  if (isOverdue(item.next_insp) && item.status !== "Critical") return "Overdue";
  return item.status;
}
