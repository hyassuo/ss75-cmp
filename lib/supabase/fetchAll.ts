// PostgREST caps every response (Supabase default: 1000 rows) and silently
// drops the rest — no error, no hint. Page through with .range() until a
// short page comes back. The caller's query MUST have a total order
// (e.g. .order("created_at").order("id")) or rows can repeat/skip between
// pages.
export const PAGE_SIZE = 1000;

// `data` is typed loosely: the hand-written Database type has no
// Relationships, so embedded selects ("*, readings(*)") don't type-check
// against T. The caller names T explicitly. `count` is the total the
// server reports when the page asked for it (withCount).
type Page = PromiseLike<{
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
}>;

export interface FetchAllResult<T> {
  data: T[];
  error: string | null;
  /** True when `max` stopped the loop before the last page. */
  truncated: boolean;
}

// Pages are requested in parallel, as each serial page costs a full
// round-trip on a high-latency link:
//  - the first wave covers `expected` rows (a hint: a count the server
//    already sent, the rows held before a refresh), else only the first
//    page, which asks for the total — withCount: the caller adds
//    { count: "exact" } to that select;
//  - once the total is known, every remaining page goes out at once;
//  - while the last page still comes back full (rows added meanwhile, or
//    no total), the next one is fetched, one at a time.
// Rows keep the page order whatever order the responses arrive in; an
// error returns the rows of the pages before the failed one.
//
// Offset paging can repeat a row when rows are inserted ahead of the
// current offset mid-scan (e.g. new audit events on a newest-first query);
// pass `key` to drop such duplicates.
export async function fetchAll<T>(
  page: (from: number, to: number, withCount: boolean) => Page,
  opts: {
    pageSize?: number;
    max?: number;
    key?: (row: T) => string;
    expected?: number;
  } = {}
): Promise<FetchAllResult<T>> {
  const size = opts.pageSize ?? PAGE_SIZE;
  const max = opts.max ?? Infinity;
  const out: T[] = [];
  const seen = new Set<string>();
  let next = 0; // offset of the first page not requested yet
  let total: number | null = null;

  // Requests up to `n` pages at once: always one, more only below `max`.
  const launch = (n: number) => {
    const wave: Promise<Awaited<ReturnType<typeof page>>>[] = [];
    do {
      const p = Promise.resolve(page(next, next + size - 1, next === 0));
      // A page after a short or failed one is never awaited: don't let its
      // rejection (if any) surface as unhandled.
      p.catch(() => {});
      wave.push(p);
      next += size;
    } while (wave.length < n && next < max);
    return wave;
  };

  let wave = launch(Math.ceil((opts.expected ?? 0) / size));
  for (;;) {
    for (const p of wave) {
      const { data, error, count } = await p;
      if (error) return { data: out, error: error.message, truncated: false };
      if (typeof count === "number") total = count;
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
    wave = launch(total !== null && total > next ? Math.ceil((total - next) / size) : 1);
  }
}
