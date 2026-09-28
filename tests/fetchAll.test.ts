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
});
