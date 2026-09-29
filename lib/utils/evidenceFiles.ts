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
  | { status: "error" }
  // Stored with a type the app never shows (SVG, HTML, unknown…).
  | { status: "blocked" };

// The only types a file is shown as — raster images and PDF. The type comes
// from the storage response, i.e. from whoever uploaded the file: a
// blob: URL of an SVG or HTML file would be a document in the app's own
// origin (script, a fake sign-in form) when opened in a tab, so anything
// else is never turned into a URL. The bucket's allowed_mime_types refuses
// such uploads too; this does not rely on it.
const VIEWABLE = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

/** `blob` re-typed to its allow-listed type, or null if it has none. */
export function viewableBlob(blob: Blob): Blob | null {
  const type = blob.type.split(";")[0].trim().toLowerCase();
  if (!VIEWABLE.has(type)) return null;
  return blob.type === type ? blob : new Blob([blob], { type });
}

// A download that hangs (a dead satellite link can keep a request open
// indefinitely) is aborted and shown as failed, with its retry, instead
// of spinning forever and holding one of the parallel slots. Generous: a
// 10 MB PDF (the bucket limit) at ~1 Mbit/s takes about 80 s.
export const DOWNLOAD_TIMEOUT_MS = 120_000;

export interface FileRef {
  path: string;
  // Images are fetched as soon as they are listed (thumbnails); other
  // attachments (PDFs) only when the user opens them.
  eager: boolean;
}

export type Downloader = (path: string, signal: AbortSignal) => Promise<Blob>;

interface Entry {
  status: "queued" | "loading" | "ready" | "error" | "blocked";
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
    private limit = 4,
    private timeoutMs = DOWNLOAD_TIMEOUT_MS
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
   * null when it fails, is blocked, or the store lets go of the file
   * meanwhile.
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
      const timer = setTimeout(() => e.ctrl.abort(), this.timeoutMs);
      this.download(path, e.ctrl.signal)
        .then(
          (raw) => {
            // Dropped meanwhile: never create a URL nobody would revoke.
            if (this.entries.get(path) !== e) return;
            const blob = viewableBlob(raw);
            if (!blob) {
              e.status = "blocked";
              this.emit();
              e.settle(null);
              return;
            }
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
          clearTimeout(timer);
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
          : e.status === "error" || e.status === "blocked"
            ? { status: e.status }
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
  // The store only hands out allow-listed blobs; checked again here so no
  // caller can turn an SVG/HTML file into a document of this origin.
  const safe = viewableBlob(blob);
  if (!safe) {
    win.close();
    return;
  }
  const url = URL.createObjectURL(safe);
  win.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), OPENED_TAB_URL_TTL_MS);
}
