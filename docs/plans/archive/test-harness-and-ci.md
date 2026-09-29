# PLAN: Test harness + CI pipeline

**Rank: 1 of 5 (do this first).**
**Why first:** the repo has zero tests, zero CI, and `main` deploys straight to
production on every push. The git history (v1.7.0 → v1.8.9 is almost entirely
"fix the previous fix" releases) shows what that costs. Every other plan in
this series lists tests as part of its acceptance criteria — this plan is the
multiplier that makes them verifiable.

## Goal

1. Add **Vitest** and unit tests that pin down the pure domain logic in
   `lib/domain/` and `lib/utils/format.ts`.
2. Add a **GitHub Actions** workflow that runs lint, typecheck, tests, and a
   production build on every push to `main` and every PR.

No behavior of the app changes. This plan only adds files and two
`package.json` entries.

## Files to touch

| File | Action |
|---|---|
| `package.json` | add `test` + `typecheck` scripts, `vitest` devDependency |
| `package-lock.json` | updated automatically by `npm install` — commit it |
| `vitest.config.ts` | **new** |
| `tests/helpers.ts` | **new** — item/reading fixtures |
| `tests/calcPriority.test.ts` | **new** |
| `tests/calcNextInspection.test.ts` | **new** |
| `tests/calcRate.test.ts` | **new** |
| `tests/effectiveStatus.test.ts` | **new** |
| `tests/itemScore.test.ts` | **new** |
| `tests/zoneScore.test.ts` | **new** |
| `tests/format.test.ts` | **new** |
| `.github/workflows/ci.yml` | **new** |

Do NOT touch any file under `app/`, `components/`, or `lib/` — this plan is
purely additive.

## Steps (in order)

### 1. Install Vitest

```bash
npm install --save-dev vitest
```

### 2. Add scripts to `package.json`

In the `"scripts"` block, after `"lint"`:

```json
"lint": "next lint",
"typecheck": "tsc --noEmit",
"test": "vitest run",
"test:watch": "vitest"
```

### 3. Create `vitest.config.ts` at the repo root

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    // Mirror tsconfig.json "paths": {"@/*": ["./*"]}
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
```

### 4. Create `tests/helpers.ts`

A factory that returns a complete `ItemWithRelations` (all fields required by
`lib/types/domain.ts` — copy the field list from the `Item` interface there):

```ts
import type { ItemWithRelations, Reading } from "@/lib/types/domain";

export function makeItem(
  overrides: Partial<ItemWithRelations> = {}
): ItemWithRelations {
  return {
    id: "item-1",
    unit_id: "unit-1",
    zone_id: "Z01",
    name: "Test item",
    mechanism: null,
    protection: null,
    ifs_obj_id: null,
    ifs_obj_desc: null,
    ifs_wo: null,
    ifs_fl: null,
    prob: null,
    cons: null,
    priority: null,
    status: "OK",
    sece: false,
    drops_risk: false,
    structural: false,
    obs_source: null,
    freq_insp: null,
    last_insp: "2026-01-01",
    next_insp: "2999-01-01",
    resolved_at: null,
    archived: false,
    notes: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    readings: [],
    evidences: [],
    ...overrides,
  };
}

export function makeReading(overrides: Partial<Reading> = {}): Reading {
  return {
    id: "r-1",
    item_id: "item-1",
    reading_date: "2026-01-01",
    depth_mm: 1,
    location: null,
    checked_by: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}
```

**Import style for every test file:** do NOT rely on Vitest globals (they
would require a tsconfig change). Start each test file with
`import { describe, it, expect } from "vitest";`.

### 5. Write the test files

The assertions below are the spec. Use dates that are unambiguously in the
past (`"2000-01-01"`) or future (`"2999-01-01"`) so tests pass regardless of
the machine's timezone — see Edge cases.

**`tests/calcPriority.test.ts`** (`lib/domain/calcPriority.ts`)
- `calcPriority(null, 3, false, null)` → `null`; same for cons null.
- Threshold table (sece=false, no flags, nextInsp=`"2999-01-01"` → no
  overdue/due-soon bonus): `(1,1)`→`"Low"` (1), `(2,3)`→`"Medium"` (6),
  `(3,4)`→`"Medium"` (12), `(3,5)`→`"High"` (15), `(5,5)`→`"Critical"` (25).
- SECE multiplier: `(3,3,true,"2999-01-01")` → weighted 13.5 → `"High"`;
  without SECE → 9 → `"Medium"`.
- DROPS + structural: `(2,2,false,"2999-01-01",true,true)` → 4+2+2=8 →
  `"Medium"`.
- Overdue bonus: `(3,4,false,"2000-01-01")` → 12+5=17 → `"High"`.
- Due-soon bonus: build a date ~10 days ahead:
  `const in10 = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);`
  then `(3,4,false,in10)` → 12+2=14 → `"High"`.

**`tests/calcNextInspection.test.ts`** (`lib/domain/calcNextInspection.ts`)
- `(null, "Annual")` → `null`; `("2026-01-15", null)` → `null`.
- `("2026-01-15", "Per operation")` → `null`; same for `"As required"`.
- `("2026-01-15", "Weekly")` → `"2026-01-22"`.
- `("2026-01-15", "Monthly")` → `"2026-02-14"` (fixed 30 days — this is
  current intended behavior, not calendar months).
- `("2024-02-28", "Annual")` → `"2025-02-27"` (365 fixed days across a leap
  year — characterization test, documents the known drift).

**`tests/calcRate.test.ts`** (`lib/domain/calcRate.ts`)
- `calcRate(null)` / `calcRate([])` / single reading → `null`.
- Two readings exactly 365 days apart (`"2025-01-01"` depth 1.0,
  `"2026-01-01"` depth 2.0) → `1` (use `toBeCloseTo(1, 5)`).
- Two readings on the same date → `null` (days <= 0 guard).
- Decreasing depth → `0` (current clamp behavior — characterization).
- Three readings where the middle one is an outlier: rate uses ONLY first and
  last (endpoint slope) — assert the middle reading has no effect.

**`tests/effectiveStatus.test.ts`** (`lib/domain/effectiveStatus.ts`)
- status `"OK"`, next_insp `"2000-01-01"` → `"Overdue"`.
- status `"Critical"`, next_insp `"2000-01-01"` → `"Critical"` (Critical wins).
- status `"Attention"`, next_insp `"2999-01-01"` → `"Attention"`.
- next_insp `null` → returns the stored status.

**`tests/itemScore.test.ts`** (`lib/domain/itemScore.ts`)
- Baseline from `makeItem()` (OK, future next_insp, has last_insp, no
  readings) → `100`.
- `status: "Critical"` → `50`; `"Attention"` → `75`; `"Pending"` → `85`.
- `next_insp: null` → `80`; `last_insp: null` → `90`.
- Readings giving rate > 0.5 (e.g. depth 1→2 over 180 days) → `75`.
- **Do NOT assert an exact score for an overdue item.** The overdue penalty is
  currently double-counted (known bug, fixed by PLAN-domain-correctness).
  Instead assert the invariant that survives the fix:
  `itemScore(makeItem({ next_insp: "2000-01-01" })) < itemScore(makeItem())`.
- `Math.max(0, …)` floor: an item with everything wrong never goes below 0.

**`tests/zoneScore.test.ts`** (`lib/domain/zoneScore.ts`)
- `zoneScore([])` → `null`; `zoneScore(null as never)` → `null` (guard).
- Single item → equals `itemScore` of that item.
- Two items with identical scores but different priorities/sece → the
  weighted average of equal values is still that value.

**`tests/format.test.ts`** (`lib/utils/format.ts`)
- `fmt("2026-07-12")` → `"12 de jul. de 2026"`; `fmt(null)` → `"-"`;
  `fmt("garbage")` → `"garbage"` (passthrough when not 3 parts).
- `fmtCompact("2026-07-12")` → `"12-Jul-2026"`.
- `fmtShort("2026-07-05")` → `"05/07/2026"`.
- `today()` matches `/^\d{4}-\d{2}-\d{2}$/`.
- `isOverdue("2000-01-01")` → `true`; `isOverdue("2999-12-31")` → `false`;
  `isOverdue(null)` / `isOverdue(undefined)` → `false`.
- `daysUntil(null)` → `null`; `daysUntil("2000-01-01")` is a negative number.

### 6. Create `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
        env:
          # Placeholders — build only needs syntactically valid values.
          NEXT_PUBLIC_SUPABASE_URL: https://placeholder.supabase.co
          NEXT_PUBLIC_SUPABASE_ANON_KEY: placeholder-anon-key
          SUPABASE_SERVICE_ROLE_KEY: placeholder-service-key
          NEXT_PUBLIC_APP_URL: http://localhost:3000
```

### 7. Verify locally, then commit

```bash
npm run lint && npm run typecheck && npm test
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key \
SUPABASE_SERVICE_ROLE_KEY=placeholder-service-key \
npm run build
```

All four must pass. Commit `package.json`, `package-lock.json`,
`vitest.config.ts`, `tests/`, `.github/`.

## Edge cases a weaker model would miss

1. **Timezone-dependent tests.** `today()` currently returns the **UTC** date
   (`lib/utils/format.ts:29-31`), and PLAN-domain-correctness will change it
   to local. Any test comparing "today ± small offset" can flip depending on
   the machine's timezone and time of day. That's why every fixed date in the
   spec above is either far past (`2000-…`) or far future (`2999-…`), and the
   only near-today date (due-soon bonus) uses a 10-day offset, which is safe
   within any UTC±14 skew.
2. **Don't pin the known-buggy overdue score.** `itemScore` currently
   subtracts overdue twice (−40 via `effectiveStatus` + −30 via `isOverdue`).
   If you write `expect(score).toBe(30)` for an overdue-OK item, PLAN 2 will
   break your test. Use the `<` invariant described above.
3. **Vitest globals vs `tsc --noEmit`.** The repo's tsconfig includes
   `**/*.ts`, so test files are typechecked. Without
   `import { describe, it, expect } from "vitest"` in every file, `npm run
   typecheck` fails even though `vitest run` passes (vitest injects globals,
   tsc doesn't know that).
4. **`npm ci` requires a clean lockfile.** If `package-lock.json` isn't
   committed after `npm install --save-dev vitest`, CI fails on `npm ci`, not
   on your tests — a confusing failure. Commit the lockfile.
5. **The build needs placeholder env vars.** `createBrowserClient` requires a
   syntactically valid URL during prerender of `/login`. Empty strings crash
   the build; the placeholder HTTPS URL works. Never put real keys in the
   workflow file.
6. **`calcRate` uses `toBeCloseTo`, not `toBe`.** `(1.0 / 365) * 365`
   accumulates float error; exact equality is flaky.
7. **Fixture completeness.** `Item` has 24 fields and TypeScript strict mode
   is on — a partial object literal fails compilation. Copy the field list
   from `lib/types/domain.ts:110-139` exactly; don't guess.

## Acceptance criteria

- [ ] `npm test` runs ≥ 40 assertions across 7 test files, all green.
- [ ] `npm run typecheck` passes (test files included).
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes with the placeholder env vars.
- [ ] `.github/workflows/ci.yml` exists; after push, the Actions tab shows a
      green run for the branch.
- [ ] `git diff main --stat` shows NO changes under `app/`, `components/`, or
      `lib/` (plan is purely additive).

## Out of scope

- Fixing any of the bugs the tests characterize (that's PLAN-domain-correctness).
- Component/UI tests (would need jsdom + testing-library; not worth it yet).
- Coverage thresholds.
