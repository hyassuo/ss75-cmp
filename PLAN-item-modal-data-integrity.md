# PLAN: ItemModal data integrity — AI overwrites, dual save paths, lost input

**Rank: 3 of 5.** Do after `PLAN-domain-correctness.md`. Independent of the
export and security plans.

## Goal

The item modal is the highest-traffic workflow (inspectors registering and
updating findings). It currently has five confirmed data-integrity traps:

1. **AI auto-apply silently overwrites user input.** After a photo analysis,
   `EvidencePanel.runAI()` auto-calls `onAIApply(result)`
   (`components/items/EvidencePanel.tsx:131`), and `applyAI`
   (`components/items/ItemModal.tsx:169-243`) overwrites `mechanism`, `prob`,
   `cons`, `status`, and `freq_insp` **unconditionally** — even values the
   user just set by hand. Only `name` is guarded.
2. **AI writes to the database before the user saves.** `applyAI` calls
   `addReading(...)` immediately (`ItemModal.tsx:235-242`). Cancelling the
   modal afterwards still leaves that reading permanently in the DB.
3. **Unsaved evidence is silently lost.** Evidence has its own "Save evidence
   record" button; the modal's main Save/Cancel/× ignore a half-filled
   evidence form (photo attached, description typed) and drop it.
4. **Selecting an IFS object does not recompute priority.** The `onSelect`
   handler (`ItemModal.tsx:465-472`) sets `sece` via plain `setF`, but SECE
   is a ×1.5 multiplier in `calcPriority` — the displayed priority goes
   stale until some other field changes.
5. **A failed photo upload is swallowed.** `EvidencePanel.add()` does
   `if (!error) filePath = path;` (`EvidencePanel.tsx:150`) — on failure it
   silently saves an evidence row with no file.

Also completes the half-built archive feature: the `archived` column exists
and every surface now filters it (PLAN 2), but there is **no UI to set it**.

## Files to touch

| File | Change |
|---|---|
| `components/items/ItemModal.tsx` | applyAI guards + force flag; staged AI reading; unsaved-evidence guard; SECE recalc; name required; archive button |
| `components/items/EvidencePanel.tsx` | pass `force` through; `onDirtyChange`; surface upload failure |
| `lib/i18n/dict.ts` | new keys (EN + PT) |

Nothing else. Do not touch `lib/domain/*` or DataContext.

## Steps (in order)

### 1. `applyAI` — fill-only-empty by default, overwrite only on explicit Apply

Change the signature (`ItemModal.tsx:169`):

```ts
function applyAI(r: AIAnalysis, force = false) {
```

Inside the `setF` updater, guard each field (keep the existing mapping
tables/coercions exactly as they are; only add the conditions):

- mechanism: `if ((force || !next.mechanism) && r.corrosionType && mechMap[r.corrosionType])`
- name: keep the existing fill-only-empty guard unchanged (never overwrite a
  typed name, even on force).
- freq_insp: wrap the existing `if (FREQUENCIES.includes(...))` block:
  `if ((force || !next.freq_insp) && FREQUENCIES.includes(freq as InspectionFrequency))`
- prob: `if ((force || next.prob == null) && Number.isFinite(prob) && prob >= 1 && prob <= 5)`
- cons: same with `next.cons == null`.
- status: wrap the whole immediateAction→status mapping in
  `if (force || x.status === "Pending")` — note `x.status`, the value before
  this apply, not `next.status`.
- Leave the final `calcPriority(next…)` recompute unconditional.

Call sites:
- `EvidencePanel` Props: change `onAIApply: (r: AIAnalysis) => void;` to
  `onAIApply: (r: AIAnalysis, force?: boolean) => void;`
- `runAI()` auto-apply (`EvidencePanel.tsx:131`): `onAIApply(result, false);`
- `AIResultCard` button (`EvidencePanel.tsx:343-346`):
  `onAIApply(aiResult, true);` — the explicit "Apply to Item Fields" click IS
  user intent to overwrite.
- `ItemModal.tsx:417`: `onAIApply={applyAI}` still typechecks (extra optional
  param).

### 2. Stage the AI pit-depth reading instead of writing it immediately

1. Add state next to `saving`:
   ```ts
   const [pendingAiReading, setPendingAiReading] = useState<number | null>(null);
   ```
2. In `applyAI`, replace the entire trailing block
   `if (r.pitDepthEstMM > 0 && item.readings.length === 0) { void addReading(...) }`
   with:
   ```ts
   if (r.pitDepthEstMM > 0 && item.readings.length === 0) {
     setPendingAiReading(r.pitDepthEstMM);
   }
   ```
3. In `save()`, before `await updateItem(item.id, patch);`:
   ```ts
   if (pendingAiReading !== null && item.readings.length === 0) {
     await addReading(item.id, {
       reading_date: today(),
       depth_mm: pendingAiReading,
       location: "AI estimate",
       checked_by: "AI Vision",
     });
   }
   ```
4. Render a notice inside the `<Section title={t("sec.pit")}>` block, above
   `<ReadingsPanel …/>`:
   ```tsx
   {pendingAiReading !== null && (
     <div
       style={{
         display: "flex", alignItems: "center", justifyContent: "space-between",
         gap: 8, background: DS.bluBg, border: "1px solid " + DS.bluBord,
         borderRadius: 8, padding: "8px 12px", marginBottom: 10,
         fontSize: 12, color: DS.blu,
       }}
     >
       <span>{t("modal.pendingAiReading")} {pendingAiReading} mm</span>
       <button
         type="button"
         onClick={() => setPendingAiReading(null)}
         style={{ background: "none", border: "none", color: DS.blu,
                  cursor: "pointer", fontSize: 14 }}
         aria-label="Discard AI reading"
       >
         ×
       </button>
     </div>
   )}
   ```
   (Check `DS.bluBg`/`DS.bluBord` exist in `lib/design/tokens.ts`; they are
   used in `EvidencePanel.tsx:309-310`. If not, use `DS.sur2`/`DS.bord`.)

Cancelling the modal now discards the staged reading for free (state dies
with the component).

### 3. Unsaved-evidence guard on Save / Cancel

1. `EvidencePanel` Props: add `onDirtyChange?: (dirty: boolean) => void;`
2. Inside `EvidencePanel`, after the state declarations:
   ```ts
   useEffect(() => {
     onDirtyChange?.(!!file || !!desc.trim());
   }, [file, desc, onDirtyChange]);
   ```
   (`useEffect` is already imported. `add()` already resets `file`/`desc` on
   success, so the flag self-clears after "Save evidence record".)
3. In `ItemModalInner`:
   ```ts
   const [evidenceDirty, setEvidenceDirty] = useState(false);
   ```
   Pass `onDirtyChange={setEvidenceDirty}` to `<EvidencePanel …/>` — pass the
   setter itself (stable identity; an inline arrow would re-fire the effect
   every render).
4. At the TOP of `save()` and `cancel()`:
   ```ts
   if (evidenceDirty && !confirm(t("modal.unsavedEvidence"))) return;
   ```

### 4. Recompute priority when an IFS object is picked

Replace the `onSelect` handler (`ItemModal.tsx:465-472`) with:

```tsx
onSelect={(o) =>
  recalcPriority(
    o
      ? { ifs_obj_id: o.id, ifs_obj_desc: o.desc, sece: o.sece }
      : { ifs_obj_id: "", ifs_obj_desc: "" }
  )
}
```

### 5. Require an item name on save

1. State: `const [nameError, setNameError] = useState(false);`
2. At the top of `save()` (after the evidence-dirty guard):
   ```ts
   const trimmedName = f.name.trim();
   if (!trimmedName) {
     setNameError(true);
     return;
   }
   ```
   and in the patch use `name: trimmedName,` (delete the
   `f.name || t("modal.untitled")` fallback).
3. The name `<Input>`: extend its onChange:
   ```tsx
   onChange={(v) => {
     set("name", v);
     if (nameError && v.trim()) setNameError(false);
   }}
   ```
   and directly below the Input add:
   ```tsx
   {nameError && (
     <div style={{ color: DS.red, fontSize: 11, marginTop: -6, marginBottom: 8 }}>
       {t("modal.nameRequired")}
     </div>
   )}
   ```

### 6. Surface photo-upload failure in EvidencePanel

1. State: `const [saveErr, setSaveErr] = useState("");`
2. In `add()`: first line `setSaveErr("");`. Replace
   `if (!error) filePath = path;` with:
   ```ts
   if (error) {
     setSaveErr(t("f.uploadFailed") + " " + error.message);
     setUploading(false);
     return;
   }
   filePath = path;
   ```
   (User keeps their photo/description and can retry — nothing is silently
   half-saved.)
3. Render it right below the "Save evidence record" button, copying the
   existing `aiErr` red-box JSX (`EvidencePanel.tsx:325-339`) with
   `{saveErr}` inside, guarded by `{saveErr && (…)}`.

### 7. Archive / Unarchive button (admins, existing items)

In the modal footer, inside the left-hand `<div>` next to the
Mark-Resolved button, add:

```tsx
{!isNew && isAdmin && (
  <button
    onClick={() => {
      void updateItem(item.id, { archived: !item.archived }).then(() => onClose());
    }}
    style={{
      background: DS.sur2, color: DS.text3, border: "1px solid " + DS.bord,
      borderRadius: 8, padding: "9px 18px", cursor: "pointer",
      fontSize: 13, fontWeight: 700,
    }}
  >
    {item.archived ? t("modal.unarchive") : t("modal.archive")}
  </button>
)}
```

Note: archived items are hidden from the Zones grid, so "Unarchive" is
reachable only until the modal closes — acceptable for now; recovery is via
SQL or a future archived-items list.

### 8. Dictionary keys — `lib/i18n/dict.ts`

Add to BOTH the `en` and `pt` objects (find the `"modal.*"` cluster and
append there). Exact strings:

| Key | en | pt |
|---|---|---|
| `modal.pendingAiReading` | `AI pit-depth estimate — will be saved as a reading when you save the item:` | `Estimativa de profundidade (IA) — será salva como leitura ao salvar o item:` |
| `modal.unsavedEvidence` | `There is an unsaved evidence entry (photo/description). OK = continue and discard it. Cancel = go back and save it first.` | `Há uma evidência não salva (foto/descrição). OK = continuar e descartar. Cancelar = voltar e salvá-la primeiro.` |
| `modal.nameRequired` | `Item name is required.` | `O nome do item é obrigatório.` |
| `modal.archive` | `Archive` | `Arquivar` |
| `modal.unarchive` | `Unarchive` | `Desarquivar` |
| `f.uploadFailed` (in the `f.*` cluster) | `Photo upload failed:` | `Falha no envio da foto:` |

The dict is `Record<Key, string | fn>` with the `Key` union derived from the
`en` object — adding to `en` extends the type; adding the same keys to `pt`
keeps parity (`translate` falls back to EN if you miss one, but don't).

## Edge cases a weaker model would miss

1. **The `undefined`-overwrite trap in `recalcPriority`.** It merges with
   `{ ...x, ...next }`. Passing `{ sece: undefined }` OVERWRITES `sece` with
   `undefined` (spread copies explicitly-undefined keys). That's why step 4
   builds two different object literals instead of
   `{ sece: o ? o.sece : undefined }`.
2. **`x.status` vs `next.status` in the status guard.** The guard must test
   the status *before* this apply. Using `next.status` would work today only
   by accident of ordering; be explicit.
3. **Stable `onDirtyChange` identity.** Passing `(d) => setEvidenceDirty(d)`
   inline recreates the callback every render, which re-runs the
   EvidencePanel effect every render. Pass `setEvidenceDirty` itself.
4. **Re-check `item.readings.length === 0` at save time**, not only at
   apply time — the user may have added a manual reading between AI apply and
   Save; the AI estimate must not duplicate it.
5. **Double-apply is now safe by construction**: auto-apply (force=false)
   then card-click (force=true) just overwrites the staged number; nothing is
   persisted twice because persistence moved to `save()`.
6. **The viewer role.** All new controls (pending-reading discard, archive
   button) that sit inside the `<fieldset disabled={isReadOnly}>` are
   auto-disabled for viewers. The archive button is in the footer OUTSIDE the
   fieldset — that's why it needs the explicit `isAdmin` guard (it has one).
7. **`save()` early-returns must not leave `saving` stuck.** Put the
   evidence-dirty and name guards BEFORE `setSaving(true)` (as specified), or
   reset `saving` on every return path.
8. **Existing evidence rows are not "dirty".** The guard watches only the
   entry form (`file`, `desc`). Saved evidence lives in the DB already and
   must not trigger the confirm.
9. **`isNew` cancel deletes the draft item row** (`cancel()` →
   `deleteItem`), which cascades to any evidence already saved via the panel.
   The unsaved-evidence confirm therefore fires for the *unsaved form*; the
   deliberate destruction of already-saved evidence on new-item cancel is
   existing, intended behavior — do not "fix" it here.

## Acceptance criteria

Manual flow (run `npm run dev` with real env):

- [ ] Existing item: set Probability=5 manually → run AI analysis (photo) →
      probability REMAINS 5; empty fields (e.g. mechanism) get filled. Click
      "Apply to Item Fields" on the result card → NOW prob is overwritten.
- [ ] Run AI on a pitting photo (pitDepthEstMM > 0) on an item with no
      readings → blue notice appears; press Cancel → reopen item → **no
      reading exists in the DB**. Repeat and press Save → reading exists with
      `location = "AI estimate"`.
- [ ] Attach a photo + type a description, do NOT click "Save evidence
      record", click Save → confirm dialog appears; Cancel returns to the
      modal with the form intact.
- [ ] Pick an IFS object with SECE=true on an item with P=3, C=3 → priority
      chip flips Medium → High immediately (13.5 ≥ 13).
- [ ] Clear the name field and Save → red "Item name is required", no save,
      button not stuck on "Saving...".
- [ ] Break the storage upload (e.g. disconnect network after page load) →
      "Photo upload failed: …" appears; no evidence row is created.
- [ ] Admin, existing item → "Archive" button archives and closes; item
      disappears from Zones grid and (with PLAN 2) all KPIs; ZonesTab shows
      "1 archived" badge.
- [ ] EN/PT toggle shows translated strings for all six new keys.
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` pass.

## Out of scope

- Modal accessibility (focus trap, Escape-to-close, aria-labels) — worthy,
  separate change.
- Merging the evidence/readings save paths into one transactional save.
- An "Archived items" browse/restore view.
