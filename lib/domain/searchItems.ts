import type { Item } from "@/lib/types/domain";

// Item search over the items already loaded in the browser (works offline,
// no extra query). Every word of the query must appear somewhere in the
// item — name, IFS object/work order/functional location, mechanism, notes
// or the zone — ignoring case and accents ("corrosao" finds "Corrosão").
// Best matches first: name starting with the query, then name containing
// it, then an IFS code, then anything else; archived items last.

export type SearchableItem = Pick<
  Item,
  | "id"
  | "name"
  | "zone_id"
  | "ifs_obj_id"
  | "ifs_obj_desc"
  | "ifs_wo"
  | "ifs_fl"
  | "mechanism"
  | "notes"
  | "archived"
>;

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_MAX_RESULTS = 20;

export function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function searchItems<T extends SearchableItem>(
  items: readonly T[],
  query: string,
  zoneName: (zid: string) => string = () => "",
  limit = SEARCH_MAX_RESULTS
): T[] {
  const q = normalize(query);
  if (q.length < SEARCH_MIN_CHARS) return [];
  const words = q.split(" ");

  const scored: Array<{ item: T; score: number }> = [];
  for (const item of items) {
    const name = normalize(item.name);
    const codes = normalize(
      [item.ifs_obj_id, item.ifs_wo, item.ifs_fl].filter(Boolean).join(" ")
    );
    const rest = normalize(
      [
        item.ifs_obj_desc,
        item.mechanism,
        item.notes,
        item.zone_id,
        zoneName(item.zone_id),
      ]
        .filter(Boolean)
        .join(" ")
    );
    const haystack = `${name} ${codes} ${rest}`;
    if (!words.every((w) => haystack.includes(w))) continue;

    let score = name.startsWith(q)
      ? 0
      : name.includes(q)
        ? 1
        : codes.includes(q)
          ? 2
          : 3;
    if (item.archived) score += 10;
    scored.push({ item, score });
  }

  return scored
    .sort(
      (a, b) =>
        a.score - b.score || a.item.name.localeCompare(b.item.name)
    )
    .slice(0, limit)
    .map((s) => s.item);
}
