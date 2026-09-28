// PostgREST caps every response (Supabase default: 1000 rows) and silently
// drops the rest — no error, no hint. Page through with .range() until a
// short page comes back. The caller's query MUST have a total order
// (e.g. .order("created_at").order("id")) or rows can repeat/skip between
// pages.
export const PAGE_SIZE = 1000;

type Page<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}>;

export interface FetchAllResult<T> {
  data: T[];
  error: string | null;
  /** True when `max` stopped the loop before the last page. */
  truncated: boolean;
}

export async function fetchAll<T>(
  page: (from: number, to: number) => Page<T>,
  opts: { pageSize?: number; max?: number } = {}
): Promise<FetchAllResult<T>> {
  const size = opts.pageSize ?? PAGE_SIZE;
  const max = opts.max ?? Infinity;
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) return { data: out, error: error.message, truncated: false };
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < size) return { data: out, error: null, truncated: false };
    if (out.length >= max) {
      return { data: out.slice(0, max), error: null, truncated: true };
    }
  }
}
