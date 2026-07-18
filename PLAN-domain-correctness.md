# PLAN: Domain correctness — dates, scoring, archived items

**Rank: 2 of 5.** Do after `PLAN-test-harness-and-ci.md` (tests make this
verifiable), before the others.

## Goal

Fix four confirmed correctness bugs in the risk/scheduling math that make the
dashboard, risk matrix, and schedule show **wrong numbers today**, in a
safety-critical (SECE) context:

1. `today()` returns the **UTC** date, so overdue/due-soon flags flip up to
   3 hours early for a Brazil-based (UTC−3) crew.
2. The overdue penalty in `itemScore` is **double-counted** (−70 instead of a
   single penalty), so any overdue item's integrity score craters.
3. **Archived items are counted** in the Dashboard KPIs, Risk Matrix,
   Schedule, and PDF report — but excluded from Active Alerts and the Zones
   tab, so the surfaces contradict each other.
4. The priority/SECE weighting formula is **duplicated** in
   `components/dashboard/Dashboard.tsx` (a hand-copied version of
   `lib/domain/zoneScore.ts` that will drift), and the corrosion-rate
   thresholds 0.5/0.2 are hardcoded in three files.

## Files to touch

| File | Change |
|---|---|
| `lib/utils/format.ts` | `today()` → local date |
| `lib/domain/itemScore.ts` | single overdue penalty; use shared rate constant |
| `lib/domain/zoneScore.ts` | export `priorityWeight` |
| `lib/domain/calcRate.ts` | export threshold constants |
| `components/dashboard/Dashboard.tsx` | delete duplicated weighting; filter archived |
| `components/dashboard/AlertBar.tsx` | use shared rate constants |
| `components/risk/RiskMatrix.tsx` | filter archived |
| `components/schedule/ScheduleView.tsx` | filter archived |
| `components/export/ExportTab.tsx` | PDF/summary exclude archived; CSV/XLSX gain an `Archived` column |
| `tests/format.test.ts`, `tests/itemScore.test.ts`, `tests/zoneScore.test.ts` | update/extend (if PLAN 1 applied) |

Do NOT touch `components/items/ItemModal.tsx` or `EvidencePanel.tsx` — those
belong to `PLAN-item-modal-data-integrity.md`.

## Steps (in order)

### 1. `lib/utils/format.ts` — local-timezone `today()`

Replace the body of `today()` (currently
`return new Date().toISOString().split("T")[0];`) with:

```ts
export function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
```

Leave `isOverdue` and `daysUntil` as they are — they compare `YYYY-MM-DD`
strings / parse both sides as UTC midnight, which stays internally consistent
(see Edge cases #1).

### 2. `lib/domain/calcRate.ts` — shared thresholds

Above `calcRate`, add:

```ts
// Corrosion-rate severity thresholds (mm/yr) — shared by rateColor,
// AlertBar, and itemScore so the bands can never drift apart.
export const RATE_CRITICAL_MM_YR = 0.5;
export const RATE_ELEVATED_MM_YR = 0.2;
```

In `rateColor`, replace `r > 0.5` with `r > RATE_CRITICAL_MM_YR` and
`r > 0.2` with `r > RATE_ELEVATED_MM_YR`.

### 3. `lib/domain/itemScore.ts` — single overdue penalty

Current bug: `effectiveStatus` maps an overdue non-Critical item to
`"Overdue"` (−40), and then the independent `isOverdue` check subtracts
another 30 → −70 total, and the item's own status penalty is lost. Replace
the whole scoring block with status-based penalties plus ONE overdue penalty:

```ts
import { calcRate, RATE_CRITICAL_MM_YR } from "@/lib/domain/calcRate";
import { isOverdue } from "@/lib/utils/format";
import type { ItemWithRelations } from "@/lib/types/domain";

// handoff 6.4 — status penalty + a single overdue penalty. Overdue used to
// be counted twice (via effectiveStatus AND isOverdue), and the stored
// status penalty was swallowed for overdue items.
export function itemScore(item: ItemWithRelations): number {
  let s = 100;
  if (item.status === "Critical") s -= 50;
  if (item.status === "Attention") s -= 25;
  if (item.status === "Pending") s -= 15;
  if (isOverdue(item.next_insp)) s -= 40;
  if (!item.next_insp) s -= 20;
  if (!item.last_insp) s -= 10;
  const rate = calcRate(item.readings);
  if (rate !== null && rate > RATE_CRITICAL_MM_YR) s -= 25;
  return Math.max(0, s);
}
```

**Delete the now-unused import** of `effectiveStatus` at the top of the file
(lint fails CI otherwise). Do not modify `lib/domain/effectiveStatus.ts`
itself — it is still used for display badges elsewhere.

Resulting behavior change (old → new), for the release notes:

| Case | Old | New |
|---|---|---|
| OK + overdue | 30 | 60 |
| Pending + overdue | 15 | 45 |
| Attention + overdue | 30 | 35 |
| Critical + overdue | 20 | 10 |
| Non-overdue items | unchanged | unchanged |

### 4. `lib/domain/zoneScore.ts` — export the weight helper

Extract the inline weight math into an exported function and use it in the
loop:

```ts
// Priority × SECE weight — shared with the Dashboard's global index.
export function priorityWeight(
  it: Pick<ItemWithRelations, "priority" | "sece">
): number {
  const pw =
    it.priority === "Critical"
      ? 1.4
      : it.priority === "High"
        ? 1.2
        : it.priority === "Medium"
          ? 1.0
          : 0.8;
  return pw * (it.sece ? 1.5 : 1.0);
}
```

Inside `zoneScore`, replace the `const pw = …` / `const sw = …` /
`const w = pw * sw;` block with `const w = priorityWeight(it);`.

### 5. `components/dashboard/Dashboard.tsx` — dedupe + filter archived

1. **Delete** the local `priorityWeight` function (lines 21–31) and its
   usage.
2. Line 40: filter archived at the source:
   ```ts
   const allItems = visibleZones
     .flatMap((z) => itemsByZone(z.zid))
     .filter((i) => !i.archived);
   ```
3. Replace the global-integrity computation (the `tw` + `gi` block around
   lines 114–123) with:
   ```ts
   const gi = zoneScore(allItems);
   ```
   (`zoneScore` is already imported; the math is identical — weighted mean of
   `itemScore` by `priorityWeight`, rounded.) Delete the `tw` variable.
4. In the per-zone list (around line 242,
   `const items = itemsByZone(z.zid);`), filter too:
   ```ts
   const items = itemsByZone(z.zid).filter((i) => !i.archived);
   ```
5. If `itemScore`/`priorityWeight` imports become unused, remove them.

### 6. `components/dashboard/AlertBar.tsx` — shared constants

Import `RATE_CRITICAL_MM_YR, RATE_ELEVATED_MM_YR` from
`@/lib/domain/calcRate` and replace the literal `0.5` (line 62) and `0.2`
(line 67). Keep the existing `if (it.archived) continue;` — it is already
correct.

### 7. `components/risk/RiskMatrix.tsx` — filter archived

Line 28–30, insert the filter before mapping:

```ts
const allItems: Array<ItemWithRelations & { zoneName: string }> = zones.flatMap(
  (z) =>
    itemsByZone(z.zid)
      .filter((i) => !i.archived)
      .map((i) => ({ ...i, zoneName: z.name }))
);
```

### 8. `components/schedule/ScheduleView.tsx` — filter archived

Lines 21–23, same pattern:

```ts
const allItems: Row[] = zones.flatMap((z) =>
  itemsByZone(z.zid)
    .filter((i) => !i.archived)
    .map((i) => ({ ...i, zid: z.zid, zname: z.name }))
);
```

### 9. `components/export/ExportTab.tsx` — archived policy for exports

Decision baked into this plan: **CSV/XLSX are the system-of-record dump and
keep archived rows (flagged); the PDF report and on-screen summary exclude
them.**

1. Right after the `flat` definition (line ~131), add:
   ```ts
   const activeFlat = flat.filter((i) => !i.archived);
   ```
2. In `itemRows()` (used by CSV + XLSX "Items" sheet), add a column at the
   end of the returned object, after `Notes`:
   ```ts
   Archived: it.archived ? "YES" : "NO",
   ```
3. In `exportPDF()`: build `items` from `activeFlat.map(...)` instead of
   `flat.map(...)`; use `activeFlat` for the `total=`, `sece=`, `critical=`
   props and for the `hasImageEvidence` check.
4. In `loadPhotos()`: change `flat.slice(0, MAX_ITEMS_WITH_PHOTOS)` to
   `activeFlat.slice(0, MAX_ITEMS_WITH_PHOTOS)`.
   (`PLAN-pdf-export-integrity.md` rewrites this line again — that's fine,
   it's written to build on `activeFlat`.)
5. The on-screen summary table `<tbody>` (line ~587 `flat.map`) →
   `activeFlat.map`. The header count (line ~505 `{flat.length}`) →
   `{activeFlat.length}`.
6. Leave the "Readings"/"Evidences"/"Change Log" XLSX sheets on `flat`
   (system-of-record: keep everything).

### 10. Tests (only if PLAN-test-harness-and-ci is applied)

- `tests/format.test.ts`: add — `today()` equals the components of
  `new Date()` via `getFullYear/getMonth/getDate` (build the expected string
  the same way the implementation does).
- `tests/itemScore.test.ts`: now pin exact overdue scores from the table in
  step 3 (e.g. `makeItem({ status: "OK", next_insp: "2000-01-01" })` → 60,
  `status: "Critical"` + overdue → 10). Keep the `<` invariant test.
- `tests/zoneScore.test.ts`: add — `priorityWeight` returns 1.4/1.2/1.0/0.8
  and ×1.5 with `sece: true` (Critical+SECE → `toBeCloseTo(2.1)`).

### 11. Verify and ship

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Bump `package.json` version (minor — scores change: e.g. 1.8.9 → 1.9.0) and
mention the itemScore rebalance table in the commit message.

## Edge cases a weaker model would miss

1. **Don't "fix" `isOverdue`/`daysUntil` to use local Dates.** They compare
   `YYYY-MM-DD` strings lexicographically / parse both sides as UTC midnight.
   Once `today()` is local, the comparison is local-day-correct everywhere.
   Rewriting them with `new Date()` arithmetic would reintroduce
   time-of-day skew.
2. **`effectiveStatus` must NOT change.** It drives status badges
   (`STATUS_COLOR["Overdue"]` etc.). Only its use inside `itemScore` is the
   bug. Also remember to delete the unused import from `itemScore.ts` —
   `next lint` treats it as an error in CI.
3. **The Dashboard early-return.** `if (!total)` returns before `gi` is
   computed, so `zoneScore(allItems)` never sees an empty array there — but
   keep the existing `gi !== null` guards in the KPI JSX anyway; they cost
   nothing.
4. **Filter before `.map`, not after.** In RiskMatrix/ScheduleView the items
   are spread into new objects (`{ ...i, zoneName }`); filtering after the
   map still works but wastes allocations and (in RiskMatrix) `withRisk` is
   derived from `allItems` — make sure the filter is upstream of every
   derivation.
5. **`archived` currently has no UI toggle.** Only direct SQL sets it (the
   column exists and ZonesTab/AlertBar already respect it). This plan makes
   all surfaces consistent so the flag is safe to use; the modal button that
   sets it is deliberately in `PLAN-item-modal-data-integrity.md` (same file
   ownership).
6. **XLSX Items sheet column order matters to users.** Append `Archived` as
   the LAST column so existing spreadsheets/pivot tables keyed to column
   letters do not shift.
7. **Score rebalance is user-visible.** Integrity gauges will jump (mostly
   upward for overdue-but-OK items). That's the point — but flag it in the
   commit message so a later "why did the numbers change" question has an
   answer.

## Acceptance criteria

- [ ] With system time set to 22:00 local UTC−3 (`TZ=America/Sao_Paulo`),
      `today()` returns the local calendar date, not tomorrow's UTC date.
      Verifiable in tests: `TZ=America/Sao_Paulo npm test` and
      `TZ=Pacific/Kiritimati npm test` both green.
- [ ] `itemScore(makeItem({ next_insp: "2000-01-01" }))` = 60 (single −40).
- [ ] Grep proof of dedupe: `grep -rn "1.4" components/` returns no
      priority-weight hits; `priorityWeight` exists only in
      `lib/domain/zoneScore.ts`.
- [ ] Grep proof of thresholds: `grep -rn "0\.5\|0\.2" components/ lib/domain/`
      shows no rate-threshold literals outside `calcRate.ts`.
- [ ] Mark an item archived via SQL
      (`UPDATE items SET archived = true WHERE id = '…'`), reload: it
      disappears from Dashboard counts, Risk Matrix, Schedule, PDF, and the
      export summary table; still appears in CSV/XLSX with `Archived = YES`;
      Active Alerts unchanged (already filtered).
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` all
      pass.

## Out of scope

- Calendar-accurate `calcNextInspection` (fixed-day intervals are documented,
  characterized in tests, and defensible for offshore inspection cadences).
- The SECE-change-doesn't-recompute-priority bug (ItemModal — PLAN 3).
- Memoization/performance (separate concern; dataset is small today).
