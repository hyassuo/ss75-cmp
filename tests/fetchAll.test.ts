import { describe, expect, it } from "vitest";
import { fetchAll } from "@/lib/supabase/fetchAll";

function pager(total: number) {
  const calls: Array<[number, number]> = [];
  const page = (from: number, to: number) => {
    calls.push([from, to]);
    const rows = Array.from(
      { length: Math.max(0, Math.min(to, total - 1) - from + 1) },
      (_, i) => from + i
    );
    return Promise.resolve({ data: rows, error: null });
  };
  return { page, calls };
}

describe("fetchAll", () => {
  it("returns every row past the 1000-row PostgREST cap", async () => {
    const { page, calls } = pager(2500);
    const r = await fetchAll(page);
    expect(r.data).toHaveLength(2500);
    expect(r.data[2499]).toBe(2499);
    expect(r.truncated).toBe(false);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("asks for one extra page when the total is an exact multiple", async () => {
    const { page, calls } = pager(2000);
    const r = await fetchAll(page);
    expect(r.data).toHaveLength(2000);
    expect(calls).toHaveLength(3);
  });

  it("handles an empty table", async () => {
    const r = await fetchAll(pager(0).page);
    expect(r).toEqual({ data: [], error: null, truncated: false });
  });

  it("stops at max and reports truncation", async () => {
    const r = await fetchAll(pager(5000).page, { max: 1500 });
    expect(r.data).toHaveLength(1500);
    expect(r.truncated).toBe(true);
  });

  it("surfaces an error with the rows fetched so far", async () => {
    let n = 0;
    const r = await fetchAll(() =>
      Promise.resolve(
        n++ === 0
          ? { data: Array(1000).fill(0), error: null }
          : { data: null, error: { message: "boom" } }
      )
    );
    expect(r.error).toBe("boom");
    expect(r.data).toHaveLength(1000);
  });

  it("drops rows repeated across pages when a key is given", async () => {
    // Page 2 re-serves row 999 (a new row was inserted ahead of the offset).
    const r = await fetchAll<{ id: number }>(
      (from) =>
        Promise.resolve({
          data:
            from === 0
              ? Array.from({ length: 1000 }, (_, i) => ({ id: i }))
              : [{ id: 999 }, { id: 1000 }],
          error: null,
        }),
      { key: (x) => String(x.id) }
    );
    expect(r.data).toHaveLength(1001);
  });

  it("asks for the total on the first page only", async () => {
    const seen: boolean[] = [];
    await fetchAll((from, to, withCount) => {
      seen.push(withCount);
      return pager(2500).page(from, to);
    });
    expect(seen).toEqual([true, false, false]);
  });
});

// A table of `total` rows served with a delay per page; tracks how many
// pages were in flight at once. `count` is what the server reports as the
// total (default: the truth) when asked.
function slowPager(
  total: number,
  opts: { count?: number | null; delay?: (from: number) => number; fail?: number } = {}
) {
  const calls: Array<[number, number, boolean]> = [];
  let inFlight = 0;
  let peak = 0;
  const page = (from: number, to: number, withCount: boolean) => {
    calls.push([from, to, withCount]);
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    return new Promise<{ data: number[] | null; error: { message: string } | null; count?: number | null }>(
      (resolve) =>
        setTimeout(() => {
          inFlight -= 1;
          if (from === opts.fail) return resolve({ data: null, error: { message: "boom" } });
          const rows = Array.from(
            { length: Math.max(0, Math.min(to, total - 1) - from + 1) },
            (_, i) => from + i
          );
          resolve({
            data: rows,
            error: null,
            ...(withCount ? { count: opts.count === undefined ? total : opts.count } : {}),
          });
        }, opts.delay?.(from) ?? 5)
    );
  };
  return { page, calls, peak: () => peak };
}

describe("fetchAll in parallel", () => {
  it("requests every remaining page at once when the first one brings the total", async () => {
    const p = slowPager(3500);
    const r = await fetchAll(p.page);
    expect(r).toEqual({ data: Array.from({ length: 3500 }, (_, i) => i), error: null, truncated: false });
    expect(p.calls).toEqual([
      [0, 999, true],
      [1000, 1999, false],
      [2000, 2999, false],
      [3000, 3999, false],
    ]);
    expect(p.peak()).toBe(3);
  });

  it("with `expected`, the first wave already covers every page", async () => {
    const p = slowPager(1216);
    const r = await fetchAll(p.page, { expected: 1216 });
    expect(r.data).toHaveLength(1216);
    expect(p.calls.map((c) => c[0])).toEqual([0, 1000]);
    expect(p.peak()).toBe(2);
  });

  it("keeps the page order when later pages answer first", async () => {
    const p = slowPager(2500, { delay: (from) => 30 - from / 100 });
    const r = await fetchAll(p.page, { expected: 2500 });
    expect(r.data).toEqual(Array.from({ length: 2500 }, (_, i) => i));
  });

  it("an error in a parallel page returns the rows of the pages before it", async () => {
    const p = slowPager(3500, { fail: 2000 });
    const r = await fetchAll(p.page);
    expect(r.error).toBe("boom");
    expect(r.data).toEqual(Array.from({ length: 2000 }, (_, i) => i));
  });

  it("pages on when the table grew past the reported total", async () => {
    const p = slowPager(2500, { count: 1500 });
    const r = await fetchAll(p.page, { expected: 1500 });
    expect(r.data).toHaveLength(2500);
    expect(p.calls.map((c) => c[0])).toEqual([0, 1000, 2000]);
  });

  it("falls back to one page at a time without a total", async () => {
    const p = slowPager(2500, { count: null });
    const r = await fetchAll(p.page);
    expect(r.data).toHaveLength(2500);
    expect(p.peak()).toBe(1);
  });

  it("stops at a short page when the table shrank below `expected`", async () => {
    const p = slowPager(1200);
    const r = await fetchAll(p.page, { expected: 4000 });
    expect(r).toEqual({ data: Array.from({ length: 1200 }, (_, i) => i), error: null, truncated: false });
  });

  it("ignores a failure of a page past the end (no unhandled rejection)", async () => {
    const r = await fetchAll(
      (from) =>
        from === 0
          ? Promise.resolve({ data: [1, 2, 3], error: null })
          : Promise.reject(new Error("dropped link")),
      { expected: 3000 }
    );
    expect(r).toEqual({ data: [1, 2, 3], error: null, truncated: false });
  });

  it("never requests pages past `max`", async () => {
    const p = slowPager(5000);
    const r = await fetchAll(p.page, { max: 1500 });
    expect(r.data).toHaveLength(1500);
    expect(r.truncated).toBe(true);
    expect(p.calls.map((c) => c[0])).toEqual([0, 1000]);
  });

  it("drops a row repeated across parallel pages when a key is given", async () => {
    const r = await fetchAll<{ id: number }>(
      (from, _to, withCount) =>
        Promise.resolve({
          data:
            from === 0
              ? Array.from({ length: 1000 }, (_, i) => ({ id: i }))
              : [{ id: 999 }, { id: 1000 }],
          error: null,
          ...(withCount ? { count: 1001 } : {}),
        }),
      { key: (x) => String(x.id) }
    );
    expect(r.data.map((x) => x.id)).toEqual(Array.from({ length: 1001 }, (_, i) => i));
  });
});
