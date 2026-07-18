# PLAN: PDF export integrity — page overflow, silent photo drops

**Rank: 4 of 5.** Do after `PLAN-domain-correctness.md` (it introduces
`activeFlat` in ExportTab; this plan builds on it — a fallback is given if
you execute this one standalone).

## Goal

Ten of the last 15 releases were PDF-export firefighting. Two serious defects
remain, both of the worst kind for a compliance document — **silent
omission**:

1. **Zones clip at the page boundary.** `components/export/PdfDocument.tsx:143`
   wraps each zone — header AND every item row — in `<View key={zid}
   wrap={false}>`. `wrap={false}` means "never split across pages": a zone
   with more rows than fit on one A4 page gets truncated/overflows, and the
   missing rows are simply absent from the report. This will bite as soon as
   any zone grows past ~35 items.
2. **Photos are dropped without a trace.** `MAX_ITEMS_WITH_PHOTOS = 50`
   slices the **first 50 items in zone order** (`ExportTab.tsx:294`) — items
   in later zones lose their photos even when earlier items have none;
   per-photo download/decode failures are swallowed (`catch {}` at
   `ExportTab.tsx:340-343`); the "photos could not be loaded" alert fires
   only when **zero** photos loaded. A PDF with 30 of 45 photos looks
   complete.

Also: the XLSX export can hang forever on the `history` fetch (its only query
with no timeout), and the `download()` helper is duplicated verbatim in
`AuditLogTable.tsx`.

## Files to touch

| File | Change |
|---|---|
| `components/export/PdfDocument.tsx` | allow zones to break across pages; keep headers attached; render photo note |
| `components/export/ExportTab.tsx` | photo-prioritized candidate list; failure/skip counting; note text; XLSX history timeout; use shared `download` |
| `lib/utils/download.ts` | **new** — shared blob-download helper |
| `components/audit/AuditLogTable.tsx` | use shared `download` |

## Steps (in order)

### 1. `lib/utils/download.ts` (new)

Move the helper verbatim from `ExportTab.tsx:27-34`:

```ts
// Trigger a browser download for an in-memory Blob.
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

Delete the local copies in `ExportTab.tsx` (lines 27–34) and
`AuditLogTable.tsx` (lines 12–19) and import from `@/lib/utils/download` in
both.

### 2. `PdfDocument.tsx` — let zones paginate, keep headers attached

1. Line 143: change `<View key={zid} wrap={false}>` to `<View key={zid}>`.
2. Group the zone title and the column header so they can't be orphaned at a
   page bottom while the rows jump to the next page. Replace:
   ```tsx
   <Text style={s.zone}>
     {zid} — {zname}
   </Text>
   <View style={s.h}>…</View>
   ```
   with:
   ```tsx
   <View wrap={false} minPresenceAhead={40}>
     <Text style={s.zone}>
       {zid} — {zname}
     </Text>
     <View style={s.h}>…columns unchanged…</View>
   </View>
   ```
   `minPresenceAhead={40}` tells @react-pdf to break early unless ≥40pt of
   content fits after the header — i.e. the header always has at least ~2
   rows under it.
3. Leave `wrap={false}` on `photoStrip` (line 130) — a strip is at most 4
   thumbnails and should stay whole.
4. Add an optional note prop. In `PdfDocProps`: `note?: string;`. In the
   component signature add `note`. After the standards `<Text style={s.sub}>`
   line (line 106–109) render:
   ```tsx
   {note ? <Text style={s.sub}>{note}</Text> : null}
   ```

### 3. `ExportTab.tsx` — loadPhotos returns counts, prioritizes items with photos

Replace `loadPhotos`'s signature and candidate selection. New return type:

```ts
type PhotoLoad = {
  photos: Map<string, PdfPhoto[]>;
  failed: number;        // photos that errored/timed out/undecodable
  skippedItems: number;  // items WITH photos beyond the cap
};
```

Inside:

1. Candidate list — only items that actually have image evidence, so the cap
   spends its 50 slots where they matter (base list: `activeFlat` from
   PLAN-domain-correctness; if that plan isn't applied yet, use `flat`):
   ```ts
   const hasImage = (it: (typeof flat)[number]) =>
     (it.evidences ?? []).some(
       (e) => !!e.file_path && (e.file_type ?? "").startsWith("image/")
     );
   const withImages = activeFlat.filter(hasImage);
   const itemsConsidered = withImages.slice(0, MAX_ITEMS_WITH_PHOTOS);
   const skippedItems = withImages.length - itemsConsidered.length;
   ```
   (The old `flat.slice(0, MAX_ITEMS_WITH_PHOTOS)` line is deleted.)
2. Failure counting — declare `let failed = 0;` next to `loaded`. In the
   worker: the `if (!error && blob)` success branch stays; add an `else
   { failed += 1; }`; and in the `catch` block increment `failed += 1;` too.
3. Return `{ photos: result, failed, skippedItems }`.

### 4. `ExportTab.tsx` — HEIC/undecodable fallback must fail loudly, not emit junk

In `blobToJpegDataURL` (line 69–100), the catch currently returns the RAW
data URL for any undecodable blob — for HEIC that produces an image
@react-pdf silently drops. Replace the catch body:

```ts
} catch {
  // Only JPEG/PNG can be embedded as-is; anything else (HEIC…) would be
  // silently dropped by @react-pdf — fail so the caller counts it.
  if (blob.type === "image/jpeg" || blob.type === "image/png") {
    return blobToDataURL(blob);
  }
  throw new Error(`undecodable image format: ${blob.type || "unknown"}`);
}
```

The throw lands in the worker's catch → counted in `failed`.

### 5. `ExportTab.tsx` — thread the counts through `exportPDF`

1. Where `photosByItem` is built:
   ```ts
   let photoLoad: PhotoLoad | undefined;
   if (includePhotos) {
     status("Looking up photos…");
     photoLoad = await loadPhotos((loaded, total) => status(…unchanged…));
   }
   const photosByItem = photoLoad?.photos;
   ```
2. Update the existing "no photos at all" alert block: keep its intent but
   base it on the new data — `if (includePhotos && photoLoad &&
   photoLoad.photos.size === 0 && (photoLoad.failed > 0))` → alert unchanged
   text. (The old `hasImageEvidence` recomputation can be deleted; `failed >
   0` implies image evidence existed.)
3. Build the note and pass it to the document:
   ```ts
   let note = "";
   if (includePhotos && photoLoad) {
     const parts = [`${photoCount} photos embedded`];
     if (photoLoad.failed > 0) parts.push(`${photoLoad.failed} failed to load`);
     if (photoLoad.skippedItems > 0)
       parts.push(
         `capped at ${MAX_ITEMS_WITH_PHOTOS} items with photos — ` +
           `${photoLoad.skippedItems} more items have photos not shown`
       );
     note = "Photos: " + parts.join(" · ");
   }
   ```
   (`photoCount` already exists — keep its computation, it needs
   `photosByItem`.) Pass `note={note || undefined}` to `<PdfDocument …/>`.
4. Also surface partial failure in the placeholder tab:
   after rendering, the existing `status(\`PDF ready…\`)` line — append
   `photoLoad?.failed ? ` (${photoLoad.failed} photos failed)` : ""`.

### 6. `ExportTab.tsx` — timeout the XLSX history fetch

In `exportXLSX`, wrap the awaited query (lines 195–199) with the existing
`withTimeout` helper:

```ts
const { data, error } = await withTimeout(
  Promise.resolve(
    supabase
      .from("history")
      .select("*")
      .in("item_id", itemIds)
      .order("event_date", { ascending: false })
  ),
  15_000,
  "history fetch"
);
```

A timeout now throws, lands in the existing catch, and surfaces via the
existing alert instead of hanging the button on "Generating…" forever.

### 7. Verify and ship

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Manual verification needs a dataset where one zone has ~40+ items (see
acceptance criteria for how to fake it).

## Edge cases a weaker model would miss

1. **`wrap={false}` removal alone is not enough** — without the
   `minPresenceAhead` header group, a zone whose rows start exactly at a page
   boundary renders its blue header as the last line of a page with all rows
   on the next. The header group restores the invariant "header is always
   directly above at least some of its rows".
2. **The PostgREST query builder is a thenable, not a Promise.**
   `withTimeout` calls `.then` on it, which works, but `Promise.resolve(...)`
   wrapping (as `loadPhotos` already does at line 326) is the established
   local pattern — keep it so both call sites look the same.
3. **`withTimeout` abandons, it does not cancel** (its own comment says so).
   A timed-out history fetch keeps running in the background; that's
   acceptable — do NOT try to add AbortController plumbing to the Supabase
   client here.
4. **Photo cap semantics changed — say so.** Previously "first 50 items in
   zone order (photos or not)", now "first 50 items *that have photos*". More
   photos appear in the same PDF; the note line documents the cap whenever it
   actually truncates. Mention it in the commit message.
5. **`skippedItems` must count items, not photos**, and only items that HAVE
   image evidence — otherwise the note would scare users on every export.
6. **Don't move `MAX_PHOTOS_PER_ITEM` filtering** — the newest-4-per-item
   sort/slice inside the job builder is intact and unrelated.
7. **`photoLoad.photos.size === 0 && failed === 0` is the legitimate "this
   dataset has no photos" case** — no alert, empty note is fine
   (`0 photos embedded` only when includePhotos and nothing to load — if you
   find that noisy, set the note only when `total jobs > 0`; either is
   acceptable, pick one and be consistent).
8. **The `console.info("[pdf] …")` lines stay.** They were added deliberately
   (v1.8.9) as production diagnostics for this exact feature; removing them
   is out of scope.
9. **`activeFlat` dependency**: if PLAN-domain-correctness has not been
   applied, `activeFlat` does not exist — use `flat` and leave a
   `// TODO: switch to activeFlat` comment. Do not silently re-add archived
   filtering yourself; that plan owns it.

## Acceptance criteria

- [ ] Seed a zone with 45 items (SQL: insert 45 rows into `items` with the
      same `zone_id`, or temporarily duplicate demo items). Export PDF: every
      one of the 45 rows appears; the zone flows across ≥ 2 pages; no page
      shows a zone header as its last line.
- [ ] Total row count in the PDF equals the item count shown on the Export
      tab (spot-check per zone).
- [ ] With photos on items in the LAST zone and >50 photo-bearing items
      total: last-zone items still get their photos as long as they're within
      the first 50 photo-bearing items; the note line reports the cap.
- [ ] Kill the network mid-photo-load (devtools offline): PDF still renders;
      note says "N failed to load"; placeholder tab shows the failure count.
- [ ] Upload a `.heic` evidence file on a browser without HEIC decode →
      export counts it as failed instead of silently omitting it.
- [ ] XLSX export with Supabase paused/unreachable errors out with the alert
      within ~15s instead of hanging on "Generating…".
- [ ] `grep -rn "function download" components/` → no hits (only
      `lib/utils/download.ts`).
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` pass.

## Out of scope

- Replacing `alert()` with a styled toast system.
- Streaming/server-side PDF generation (deliberately moved client-side in
  v1.8.0 — do not revisit).
- Embedding photos for ALL items (the cap exists for tab-memory reasons;
  raising it is a product decision).
