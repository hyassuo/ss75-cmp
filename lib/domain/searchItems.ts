import type { Item } from "@/lib/types/domain";

// Item search over the items already loaded in the browser (works offline,
// no extra query). Every word of the query must appear somewhere in the
// item — name, IFS object/work order/functional location, mechanism, notes
// or the zone — ignoring case and accents ("corrosao" finds "Corrosão") and,
// for codes, punctuation ("313a1" finds "313-A1-01").
// Best matches first: name starting with the query, then name containing
// it, then an IFS code, then anything else; archived items last.
//
// buildSearchIndex() normalises the text once per data change; the search
// itself (per keystroke) only runs substring checks.

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
export const SEARCH_MAX_CHARS = 100;

export function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Letters and digits only: "wo-5" and "wo5" become the same.
const compact = (s: string) => s.replace(/[^a-z0-9]/g, "");

export interface SearchEntry<T> {
  item: T;
  name: string;
  codes: string;
  haystack: string;
  compactHaystack: string;
}

export function buildSearchIndex<T extends SearchableItem>(
  items: readonly T[],
  zoneName: (zid: string) => string = () => ""
): SearchEntry<T>[] {
  return items.map((item) => {
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
    return { item, name, codes, haystack, compactHaystack: compact(haystack) };
  });
}

export function searchIndex<T>(
  index: readonly SearchEntry<T>[],
  query: string,
  limit = SEARCH_MAX_RESULTS
): T[] {
  const q = normalize(query.slice(0, SEARCH_MAX_CHARS));
  if (q.length < SEARCH_MIN_CHARS) return [];
  const words = q.split(" ");
  const compactWords = words.map(compact);
  const compactQ = compact(q);

  const scored: Array<{ e: SearchEntry<T>; score: number }> = [];
  for (const e of index) {
    const hit = words.every(
      (w, i) =>
        e.haystack.includes(w) ||
        (compactWords[i].length > 0 && e.compactHaystack.includes(compactWords[i]))
    );
    if (!hit) continue;
    let score = e.name.startsWith(q)
      ? 0
      : e.name.includes(q)
        ? 1
        : e.codes.includes(q) || (compactQ && compact(e.codes).includes(compactQ))
          ? 2
          : 3;
    if ((e.item as { archived?: boolean }).archived) score += 10;
    scored.push({ e, score });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.e.name.localeCompare(b.e.name))
    .slice(0, limit)
    .map((s) => s.e.item);
}

// One-shot convenience (tests, small lists).
export function searchItems<T extends SearchableItem>(
  items: readonly T[],
  query: string,
  zoneName?: (zid: string) => string,
  limit = SEARCH_MAX_RESULTS
): T[] {
  return searchIndex(buildSearchIndex(items, zoneName), query, limit);
}
