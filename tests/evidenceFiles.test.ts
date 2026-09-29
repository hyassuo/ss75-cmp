import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EvidenceFileStore,
  OPENED_TAB_URL_TTL_MS,
  showBlobInTab,
  viewableBlob,
  type FileState,
} from "@/lib/utils/evidenceFiles";

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

  it("never makes a URL for a file stored as SVG, HTML or an unknown type", async () => {
    const { calls, download } = manual();
    let last: Record<string, FileState> = {};
    const store = new EvidenceFileStore(download, (s) => (last = s));
    const types = { svg: "image/svg+xml", html: "text/html", none: "", xml: "application/xhtml+xml" };
    store.sync(Object.keys(types).map((path) => ({ path, eager: true })));
    for (const [path, type] of Object.entries(types)) {
      calls.get(path)!.resolve(new Blob(["<svg onload=alert(1)>"], { type }));
    }
    await flush();
    for (const path of Object.keys(types)) expect(last[path]).toEqual({ status: "blocked" });
    expect(created).toEqual([]);
    // Opening it: no second download, nothing to show.
    calls.clear();
    expect(await store.load("svg")).toBeNull();
    expect(calls.size).toBe(0);
  });

  it("shows images and PDFs under their allow-listed type only", async () => {
    const { calls, download } = manual();
    const store = new EvidenceFileStore(download, () => {});
    const p = store.load("a.pdf");
    calls.get("a.pdf")!.resolve(new Blob(["%PDF-"], { type: "application/pdf;charset=binary" }));
    expect((await p)?.type).toBe("application/pdf");
    for (const t of ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]) {
      expect(viewableBlob(new Blob(["x"], { type: t }))?.type).toBe(t);
    }
    for (const t of ["image/svg+xml", "text/html", "text/plain", "application/octet-stream", ""]) {
      expect(viewableBlob(new Blob(["x"], { type: t }))).toBeNull();
    }
  });

  it("gives up on a download that hangs: error + retry, and its slot moves on", async () => {
    vi.useFakeTimers();
    try {
      const { calls, download } = manual();
      let last: Record<string, FileState> = {};
      const store = new EvidenceFileStore(download, (s) => (last = s), 1, 5_000);
      store.sync(["a", "b"].map((path) => ({ path, eager: true })));
      const a = calls.get("a")!;
      // The real downloader rejects when its signal aborts.
      a.signal.addEventListener("abort", () => a.reject(new Error("aborted")));
      expect(calls.has("b")).toBe(false);
      await vi.advanceTimersByTimeAsync(4_999);
      expect(last.a).toEqual({ status: "loading" });
      await vi.advanceTimersByTimeAsync(1);
      expect(a.signal.aborted).toBe(true);
      expect(last.a).toEqual({ status: "error" });
      expect(calls.has("b")).toBe(true);
      // A download that completes in time clears its timer.
      calls.get("b")!.resolve(blob("b"));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(calls.get("b")!.signal.aborted).toBe(false);
      expect(last.b.status).toBe("ready");
    } finally {
      vi.useRealTimers();
    }
  });

  it("showBlobInTab: its own URL, revoked later; an SVG is never shown", () => {
    vi.useFakeTimers();
    try {
      const win = { location: { href: "" }, close: vi.fn() } as unknown as Window;
      showBlobInTab(win, new Blob(["<svg/>"], { type: "image/svg+xml" }));
      expect(win.close).toHaveBeenCalled();
      expect(win.location.href).toBe("");
      expect(created).toEqual([]);
      showBlobInTab(win, blob("a"));
      expect(win.location.href).toBe(created[0]);
      vi.advanceTimersByTime(OPENED_TAB_URL_TTL_MS);
      expect(revoked).toEqual([created[0]]);
    } finally {
      vi.useRealTimers();
    }
  });
});
