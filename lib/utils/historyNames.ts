import type { HistoryEntry } from "@/lib/types/domain";

type NamedRow = Pick<HistoryEntry, "item_ref" | "item_name" | "event_date">;

// Best display name per item_ref for audit rows whose item may be gone.
// Each row snapshots the name at event time, so a new item's 'created'
// event says "Untitled"; prefer the most recent real name seen for that
// item across all loaded rows.
export function latestNameByRef(rows: NamedRow[]): Map<string, string> {
  const best = new Map<string, { name: string; at: string }>();
  for (const r of rows) {
    if (!r.item_ref || !r.item_name || r.item_name === "Untitled") continue;
    const cur = best.get(r.item_ref);
    if (!cur || r.event_date > cur.at) {
      best.set(r.item_ref, { name: r.item_name, at: r.event_date });
    }
  }
  return new Map(Array.from(best, ([k, v]) => [k, v.name]));
}
