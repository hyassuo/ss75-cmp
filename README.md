# SS-75 CMP — Corrosion Management Plan

Production rebuild of the SS-75 Noble Courage Corrosion Management Plan.
Next.js 15 (App Router, TypeScript strict) · Supabase (Postgres, Auth,
Storage) · Tailwind 3 · Gemini for AI photo analysis. Node 22 (`.nvmrc`).

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_API_KEY` (free at https://aistudio.google.com/apikey)
   - `NEXT_PUBLIC_APP_URL`
3. `npm run dev` → http://localhost:3000

### AI provider

`lib/ai/client.ts` calls the **Gemini** API. Set `GEMINI_API_KEY` and
optionally `GEMINI_MODEL` (defaults to `gemini-2.5-flash`). AI output
is advisory triage only — item criticality is driven by the
deterministic risk matrix (P×C, SECE, overdue) plus quantitative
pit-depth readings.

## Database (Supabase)

```
supabase/
  config.toml                 Supabase CLI project config (local dev)
  migrations/                 the schema, applied in order (Supabase CLI)
    20260928000000_baseline.sql       tables, RLS (hardening rounds 1–5),
                                      triggers, storage bucket + policies,
                                      1 unit + 14 DROPS zones
    20260928000100_ifs_register.sql   IFS Equipment Register table
  seed/
    ifs-data.sql              11,312-row IFS register (TRUNCATE + INSERT)
    demo.sql                  optional ~25 [DEMO] items (registered in
                              demo_seed_items; re-runs only replace those)
  upgrades/                   in-place upgrades for databases created
                              before the baseline (see below)
  ops/
    backup-snapshot.sql       read-only JSON dump of the app tables
```

### New project

With the [Supabase CLI](https://supabase.com/docs/guides/cli):
`supabase link --project-ref <ref>` then `supabase db push` (applies
`migrations/`), and load `seed/ifs-data.sql` in the SQL Editor. Without
the CLI, paste the two migration files and then the seed into the SQL
Editor, in that order — every file is idempotent.

**Before opening the app to users:** in Supabase → Authentication, turn
**off** public sign-ups and turn **on** email confirmation. The baseline
auto-promotes the first sign-in of `hyassuo@gmail.com` to admin (the
bootstrap account); every other account is created by an admin on the
**Users** page and starts inactive otherwise.

### Existing database (created before the baseline)

Download a snapshot first (`supabase/ops/backup-snapshot.sql`), then run
the files of `supabase/upgrades/` in the SQL Editor, starting from the
version the database is at (all idempotent):

| From | Run, in order |
|------|---------------|
| before v1.3 | `schema-v130.sql` → `schema-v140.sql` → `security-fixes.sql` → `hardening.sql` → `hardening-3.sql` → `hardening-4.sql` → `hardening-5.sql` → `schema-v115.sql` |
| v1.3 – v1.13 | `schema-v140.sql` → `security-fixes.sql` → `hardening.sql` → `hardening-3.sql` → `hardening-4.sql` → `hardening-5.sql` → `schema-v115.sql` |
| v1.14 (this repo before v1.14.1) | `hardening-5.sql` → `schema-v115.sql` |

then re-run `supabase/migrations/20260928000100_ifs_register.sql` (makes the
IFS register read-only at runtime).

- `hardening-5.sql` is security round 5 (authorship, an audit trail that
  survives deletion, the storage-policy fix, the server-side draft sweep —
  details in its header). It depends on the v1.4 columns. If you ever
  re-run an older file (`security-fixes`, `hardening*`, `schema-v130/140`),
  re-run `hardening-5.sql` afterwards: older rounds redefine some objects
  with weaker versions.
- `rollback-v140.sql` refuses to run under round 5 — restore a backup
  instead.

Then adopt the migration history once, so `supabase db push` only applies
future migrations, and check for drift:

```
supabase link --project-ref <ref>
supabase migration repair --status applied 20260928000000 20260928000100
supabase db diff --linked   # should report no schema differences
```

### Schema changes from now on

Add a new file with `supabase migration new <name>`, write idempotent SQL,
add checks to `tests/sql/run.sh`, and apply with `supabase db push`. Push
the SQL **before** merging code that depends on it: Vercel deploys `main`
immediately.

### Refreshing the IFS register

`node scripts/gen-ifs-seed.js path/to/Objects.xlsx` regenerates
`supabase/seed/ifs-data.sql` (it warns about duplicate Object IDs whose
SECE flag disagrees). Run the file in the SQL Editor: the `TRUNCATE` at the
top wipes the previous rows. The `sece` flag is the source of truth the
item modal copies when an Object is selected.

## Backups

- **Point-in-time recovery**: enable PITR in Supabase (paid add-on) for
  minute-level restores of the database.
- **Daily off-site copy** — `.github/workflows/backup.yml` runs
  `scripts/backup.sh`: a restorable data dump (`data.sql`), a full
  custom-format dump (`database.dump`, forensic) and every file of the
  `evidence-photos` bucket, packed and encrypted with
  [age](https://age-encryption.org), kept as a workflow artifact for 30
  days. It is off until you set the repository variable
  `BACKUP_ENABLED=true` and the secrets `SUPABASE_DB_URL` (the **session
  pooler** connection string — the direct `db.<ref>` host is IPv6-only and
  GitHub runners have no IPv6), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  and `BACKUP_AGE_RECIPIENT` (an age *public* key — keep the private key
  offline; it is the only way to restore).

**Restore** (into a new or emptied project; rehearse it once):

1. `age -d -i key.txt ss75-backup-….tar.gz.age | tar xz`
2. Create the schema: `supabase link --project-ref <ref> && supabase db push`.
3. `psql "<session pooler URL>" -f ss75-backup-…/data.sql` — data only,
   loaded with triggers off (`session_replication_role = replica`), so
   authorship/audit triggers neither rewrite nor duplicate history.
4. `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/restore-storage.mjs ss75-backup-…/storage`
   re-uploads the photos to the same paths.

## Tests

| Command | What it covers |
|---------|----------------|
| `npm test` | Vitest unit tests: domain logic (priority, dates across time zones, corrosion rate…), the item-form diff/rebase logic, CSV escaping, paging, redirects (`tests/*.test.ts`). |
| `npm run test:sql` | RLS / trigger regression suite (`tests/sql/run.sh`): spins up a throwaway PostgreSQL (needs the server binaries, e.g. `apt install postgresql`), loads a minimal Supabase stand-in and the schema files, then attacks the policies as each role — fresh install, the full upgrade chain, demo seed and rollback guard. |

CI (`.github/workflows/ci.yml`, least-privilege, actions pinned by SHA)
runs lint, typecheck, unit tests (also under four time zones), a
production build, `npm audit` (fails on high/critical in shipped
dependencies) and the SQL suite. Dependabot proposes dependency and action
updates (`.github/dependabot.yml`).

## Storage (evidence photos)

Inspection photos uploaded from the item modal go to the **private**
Supabase Storage bucket `evidence-photos`. Path convention:

```
{item_id}/{uuid}_{filename}
```

RLS scopes SELECT, INSERT and DELETE to the owning item's unit, so
photos never leak across units (see hardening round 5 for the
`objects.name` qualification this depends on). Files are displayed in the modal via
signed URLs. The PDF export embeds photo thumbnails (with a note when some
could not be loaded).

## PWA

The app is installable (Add to Home Screen / Install app):

- `app/manifest.ts` → served at `/manifest.webmanifest` (icons in
  `public/icons/`, generated from `app/icon.svg`).
- `public/sw.js` — minimal service worker: network-first navigations with
  a branded offline page (`public/offline.html`); cache-first only for
  content-hashed build assets. **No page or API data is ever cached** —
  auth'd content stays fresh and private. Bump `VERSION` inside `sw.js`
  to force-invalidate the asset cache on a deploy.
- Registered by `components/layout/PwaRegister.tsx` (production only).
- The middleware matcher excludes `sw.js`, `manifest.webmanifest` and
  `offline.html` — they must load without a session.

## Deploy

Connected to Vercel via GitHub. The `main` branch is the production
branch — every push to `main` triggers a Vercel build that goes
directly to Production. Set the same env vars in
**Vercel → Project Settings → Environment Variables**.

Version is read from `package.json` and shown in the footer; bump it
following semver (patch / minor / major) before pushing a release.

---

Developed by Helcio Yassuo
