// PostgREST caps every response (Supabase default: 1000 rows) and silently
// drops the rest — no error, no hint. Page through with .range() until a
// short page comes back. The caller's query MUST have a total order
// (e.g. .order("created_at").order("id")) or rows can repeat/skip between
// pages.
export const PAGE_SIZE = 1000;

// `data` is typed loosely: the hand-written Database type has no
// Relationships, so embedded selects ("*, readings(*)") don't type-check
// against T. The caller names T explicitly.
type Page = PromiseLike<{
  data: unknown;
  error: { message: string } | null;
}>;

export interface FetchAllResult<T> {
  data: T[];
  error: string | null;
  /** True when `max` stopped the loop before the last page. */
  truncated: boolean;
}

// Offset paging can repeat a row when rows are inserted ahead of the
// current offset mid-scan (e.g. new audit events on a newest-first query);
// pass `key` to drop such duplicates.
export async function fetchAll<T>(
  page: (from: number, to: number) => Page,
  opts: { pageSize?: number; max?: number; key?: (row: T) => string } = {}
): Promise<FetchAllResult<T>> {
  const size = opts.pageSize ?? PAGE_SIZE;
  const max = opts.max ?? Infinity;
  const out: T[] = [];
  const seen = new Set<string>();
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) return { data: out, error: error.message, truncated: false };
    const rows = (data ?? []) as T[];
    for (const r of rows) {
      if (opts.key) {
        const k = opts.key(r);
        if (seen.has(k)) continue;
        seen.add(k);
      }
      out.push(r);
    }
    if (rows.length < size) return { data: out, error: null, truncated: false };
    if (out.length >= max) {
      return { data: out.slice(0, max), error: null, truncated: true };
    }
  }
}
