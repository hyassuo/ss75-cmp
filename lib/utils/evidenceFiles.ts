// In-memory viewer for the evidence files of the open item (backlog C7).
//
// Photos are private: no URL that works outside the signed-in session may
// exist (no signed links to copy, forward or find in the history). Each
// file is downloaded with the user's JWT and shown through a `blob:` object
// URL, which lives only in this tab's memory and dies with it. The store
// keeps the files of one item: files that leave the list and everything on
// dispose() have their object URLs revoked and their downloads aborted.

export type FileState =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "error" };

export interface FileRef {
  path: string;
  // Images are fetched as soon as they are listed (thumbnails); other
  // attachments (PDFs) only when the user opens them.
  eager: boolean;
}

export type Downloader = (path: string, signal: AbortSignal) => Promise<Blob>;

interface Entry {
  status: "queued" | "loading" | "ready" | "error";
  blob?: Blob;
  url?: string;
  ctrl: AbortController;
  done: Promise<Blob | null>;
  settle: (b: Blob | null) => void;
}

export class EvidenceFileStore {
  private entries = new Map<string, Entry>();
  private queue: string[] = [];
  private active = 0;
  private disposed = false;

  constructor(
    private download: Downloader,
    private onChange: (files: Record<string, FileState>) => void,
    // A satellite link does better with a few parallel downloads than
    // with 30 at once.
    private limit = 4
  ) {}

  /** The files of the open item; drops (and revokes) the ones that left. */
  sync(files: FileRef[]) {
    if (this.disposed) return;
    const keep = new Set(files.map((f) => f.path));
    for (const path of [...this.entries.keys()]) {
      if (!keep.has(path)) this.drop(path);
    }
    for (const f of files) {
      if (f.eager && !this.entries.has(f.path)) this.enqueue(f.path);
    }
    this.pump();
    this.emit();
  }

  /**
   * The file's bytes: the copy in memory, the download in flight, or a new
   * download (first open of an attachment, or a retry after an error).
   * null when it fails or the store lets go of the file meanwhile.
   */
  load(path: string): Promise<Blob | null> {
    if (this.disposed) return Promise.resolve(null);
    const e = this.entries.get(path);
    if (e && e.status !== "error") return e.done;
    if (e) this.entries.delete(path);
    const done = this.enqueue(path);
    this.pump();
    this.emit();
    return done;
  }

  /** Revokes every object URL and aborts every download. */
  dispose() {
    this.disposed = true;
    for (const path of [...this.entries.keys()]) this.drop(path);
    this.queue = [];
  }

  private enqueue(path: string): Promise<Blob | null> {
    let settle!: (b: Blob | null) => void;
    const done = new Promise<Blob | null>((r) => (settle = r));
    this.entries.set(path, { status: "queued", ctrl: new AbortController(), done, settle });
    this.queue.push(path);
    return done;
  }

  private drop(path: string) {
    const e = this.entries.get(path);
    if (!e) return;
    this.entries.delete(path);
    e.ctrl.abort();
    if (e.url) URL.revokeObjectURL(e.url);
    e.settle(null);
  }

  private pump() {
    while (this.active < this.limit && this.queue.length) {
      const path = this.queue.shift() as string;
      const e = this.entries.get(path);
      if (!e || e.status !== "queued") continue;
      e.status = "loading";
      this.active += 1;
      this.download(path, e.ctrl.signal)
        .then(
          (blob) => {
            // Dropped meanwhile: never create a URL nobody would revoke.
            if (this.entries.get(path) !== e) return;
            e.blob = blob;
            e.url = URL.createObjectURL(blob);
            e.status = "ready";
            this.emit();
            e.settle(blob);
          },
          () => {
            if (this.entries.get(path) !== e) return;
            e.status = "error";
            this.emit();
            e.settle(null);
          }
        )
        .finally(() => {
          // Queued and loading look the same: nothing new to report.
          this.active -= 1;
          this.pump();
        });
    }
  }

  private emit() {
    if (this.disposed) return;
    const out: Record<string, FileState> = {};
    for (const [path, e] of this.entries) {
      out[path] =
        e.status === "ready"
          ? { status: "ready", url: e.url as string }
          : e.status === "error"
            ? { status: "error" }
            : { status: "loading" };
    }
    this.onChange(out);
  }
}

// How long the object URL behind a tab the user opened stays valid. The
// tab has read the bytes long before; revoking only means a reload of that
// tab finds nothing — the photo is not kept anywhere once the app lets go.
export const OPENED_TAB_URL_TTL_MS = 60_000;

/**
 * Shows `blob` in `win` (a tab opened inside the click, so no popup
 * blocker interferes) through its own object URL — not the thumbnail's,
 * which closing the item revokes while the tab may still be loading.
 */
export function showBlobInTab(win: Window, blob: Blob) {
  const url = URL.createObjectURL(blob);
  win.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), OPENED_TAB_URL_TTL_MS);
}
