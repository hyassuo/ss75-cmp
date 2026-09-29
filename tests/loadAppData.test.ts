import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadAppData,
  preloadAppData,
  takePreloadedAppData,
} from "@/lib/supabase/loadAppData";

type Client = Parameters<typeof loadAppData>[0];
type Row = { id: string };

// A stand-in for the browser client: zones/subareas answer at once; item
// pages answer after `pageDelay` ms with the rows present THEN (like
// separate PostgREST requests, each its own snapshot); the draft sweep
// deletes `sweep` ids after `sweepDelay` ms.
function fakeClient(opts: {
  items: Row[];
  sweep?: string[];
  pageDelay?: number;
  sweepDelay?: number;
}) {
  const rows = [...opts.items];
  const pages: number[] = [];
  const later = <T>(ms: number, fn: () => T) =>
    new Promise<T>((resolve) => setTimeout(() => resolve(fn()), ms));
  const client = {
    from(table: string) {
      let withCount = false;
      const b = {
        select(_s: string, o?: { count?: string }) {
          withCount = o?.count === "exact";
          return b;
        },
        order() {
          return b;
        },
        range(from: number, to: number) {
          pages.push(from);
          return later(opts.pageDelay ?? 5, () => ({
            data: rows.slice(from, to + 1),
            error: null,
            ...(withCount ? { count: rows.length } : {}),
          }));
        },
        then(resolve: (v: unknown) => void) {
          resolve({ data: [{ id: table }], error: null });
        },
      };
      return b;
    },
    rpc() {
      return later(opts.sweepDelay ?? 0, () => {
        const gone = opts.sweep ?? [];
        for (const id of gone) {
          const i = rows.findIndex((r) => r.id === id);
          if (i >= 0) rows.splice(i, 1);
        }
        return { data: gone, error: null };
      });
    },
  };
  return { client: client as unknown as Client, pages };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}` }));

describe("loadAppData", () => {
  it("drops the swept drafts from the items", async () => {
    const { client } = fakeClient({ items: ids(20), sweep: ["r3"] });
    const r = await loadAppData(client, { sweep: true });
    expect(r.ok && r.items.map((i) => i.id)).toEqual(
      ids(20).map((x) => x.id).filter((x) => x !== "r3")
    );
  });

  it("never skips a row when the sweep deletes one between two page reads", async () => {
    // Page 0 is read at 10 ms, the draft (in page 0) deleted at 15 ms, page
    // 1 read at 20 ms: its offset now starts one row later.
    const { client, pages } = fakeClient({
      items: ids(1500),
      sweep: ["r10"],
      pageDelay: 10,
      sweepDelay: 15,
    });
    const r = await loadAppData(client, { sweep: true });
    const want = ids(1500).map((x) => x.id).filter((x) => x !== "r10");
    expect(r.ok && r.items.map((i) => i.id)).toEqual(want);
    expect(pages.length).toBeGreaterThan(2); // read again after the sweep
  });

  it("reads the items once when nothing was swept", async () => {
    const { client, pages } = fakeClient({ items: ids(1500), sweep: [] });
    const r = await loadAppData(client, { sweep: true, expectedItems: 1500 });
    expect(r.ok && r.items).toHaveLength(1500);
    expect(pages).toEqual([0, 1000]);
  });
});

describe("sign-in preload", () => {
  afterEach(() => {
    vi.useRealTimers();
    takePreloadedAppData(""); // leave nothing behind for the next test
  });

  it("is handed over once, and only to the user it was loaded for", async () => {
    const { client } = fakeClient({ items: ids(3) });
    preloadAppData(client, "user-a");
    expect(takePreloadedAppData("user-b")).toBeNull();
    // A mismatched take also discards it: user A's rows are gone.
    expect(takePreloadedAppData("user-a")).toBeNull();

    preloadAppData(client, "user-a");
    const p = takePreloadedAppData("user-a");
    expect(p).not.toBeNull();
    expect(takePreloadedAppData("user-a")).toBeNull();
    const r = await p!;
    expect(r.ok && r.items).toHaveLength(3);
  });

  it("a later sign-in replaces an earlier one", () => {
    const { client } = fakeClient({ items: ids(3) });
    preloadAppData(client, "user-a");
    preloadAppData(client, "user-b");
    expect(takePreloadedAppData("user-a")).toBeNull();
    preloadAppData(client, "user-a");
    preloadAppData(client, "user-b");
    expect(takePreloadedAppData("user-b")).not.toBeNull();
  });

  it("is not handed over once stale", () => {
    vi.useFakeTimers();
    const { client } = fakeClient({ items: ids(3) });
    preloadAppData(client, "user-a");
    vi.advanceTimersByTime(30_001);
    expect(takePreloadedAppData("user-a")).toBeNull();
  });
});
