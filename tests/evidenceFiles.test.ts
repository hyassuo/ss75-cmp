import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EvidenceFileStore, type FileState } from "@/lib/utils/evidenceFiles";

// A downloader whose calls the test resolves or rejects by hand.
function manual() {
  const calls = new Map<
    string,
    { resolve: (b: Blob) => void; reject: (e: Error) => void; signal: AbortSignal }
  >();
  const download = (path: string, signal: AbortSignal) =>
    new Promise<Blob>((resolve, reject) => calls.set(path, { resolve, reject, signal }));
  return { calls, download };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const blob = (s: string) => new Blob([s], { type: "image/png" });

let created: string[];
let revoked: string[];
beforeEach(() => {
  created = [];
  revoked = [];
  let n = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
    const u = `blob:test/${++n}`;
    created.push(u);
    return u;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation((u: string) => {
    revoked.push(u);
  });
});
afterEach(() => vi.restoreAllMocks());

describe("EvidenceFileStore", () => {
  it("downloads eager files at most `limit` at a time, in order", async () => {
    const { calls, download } = manual();
    let last: Record<string, FileState> = {};
    const store = new EvidenceFileStore(download, (s) => (last = s), 2);
    store.sync(["a", "b", "c"].map((path) => ({ path, eager: true })));
    expect([...calls.keys()]).toEqual(["a", "b"]);
    expect(last.c).toEqual({ status: "loading" });
    calls.get("a")!.resolve(blob("a"));
    await flush();
    expect([...calls.keys()]).toEqual(["a", "b", "c"]);
    expect(last.a).toEqual({ status: "ready", url: "blob:test/1" });
  });

  it("leaves attachments alone until they are opened", async () => {
    const { calls, download } = manual();
    const store = new EvidenceFileStore(download, () => {});
    store.sync([{ path: "doc.pdf", eager: false }]);
    expect(calls.size).toBe(0);
    const p = store.load("doc.pdf");
    calls.get("doc.pdf")!.resolve(blob("pdf"));
    expect(await p).toBeInstanceOf(Blob);
    // Opened again: the copy in memory, no second download.
    calls.clear();
    expect(await store.load("doc.pdf")).toBeInstanceOf(Blob);
    expect(calls.size).toBe(0);
  });

  it("revokes the URL of a file that leaves the list, and aborts one in flight", async () => {
    const { calls, download } = manual();
    let last: Record<string, FileState> = {};
    const store = new EvidenceFileStore(download, (s) => (last = s));
    store.sync([{ path: "a", eager: true }, { path: "b", eager: true }]);
    calls.get("a")!.resolve(blob("a"));
    await flush();
    store.sync([]);
    expect(revoked).toEqual(["blob:test/1"]);
    expect(calls.get("b")!.signal.aborted).toBe(true);
    // A download that lands after its file was dropped creates no URL.
    calls.get("b")!.resolve(blob("b"));
    await flush();
    expect(created).toEqual(["blob:test/1"]);
    expect(last).toEqual({});
  });

  it("dispose() revokes every URL and stops reporting", async () => {
    const { calls, download } = manual();
    const onChange = vi.fn();
    const store = new EvidenceFileStore(download, onChange);
    store.sync(["a", "b"].map((path) => ({ path, eager: true })));
    calls.get("a")!.resolve(blob("a"));
    calls.get("b")!.resolve(blob("b"));
    await flush();
    onChange.mockClear();
    store.dispose();
    expect(revoked.sort()).toEqual([...created].sort());
    expect(created).toHaveLength(2);
    store.sync([{ path: "c", eager: true }]);
    expect(onChange).not.toHaveBeenCalled();
    expect(await store.load("a")).toBeNull();
  });

  it("a failed file shows an error on its own; load() retries it", async () => {
    const { calls, download } = manual();
    let last: Record<string, FileState> = {};
    const store = new EvidenceFileStore(download, (s) => (last = s));
    store.sync(["a", "b"].map((path) => ({ path, eager: true })));
    calls.get("a")!.reject(new Error("offline"));
    calls.get("b")!.resolve(blob("b"));
    await flush();
    expect(last.a).toEqual({ status: "error" });
    expect(last.b.status).toBe("ready");
    // Re-syncing the same list does not retry by itself.
    calls.delete("a");
    store.sync(["a", "b"].map((path) => ({ path, eager: true })));
    expect(calls.has("a")).toBe(false);
    const p = store.load("a");
    expect(last.a).toEqual({ status: "loading" });
    calls.get("a")!.resolve(blob("a2"));
    expect(await p).toBeInstanceOf(Blob);
    expect(last.a.status).toBe("ready");
  });
});
