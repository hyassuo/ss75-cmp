# SS-75 CMP: Corrosion Management Plan

Production rebuild of the SS-75 Noble Courage Corrosion Management Plan.
Next.js 16 (App Router, Turbopack, TypeScript strict) · React 19 ·
Supabase (Postgres, Auth, Storage) · inline styles on CSS-variable design
tokens (`lib/design/`) · Gemini for AI photo analysis. Node 22 (`.nvmrc`).

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
is advisory triage only: item criticality is driven by the
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
Editor, in that order: every file is idempotent.

**Before opening the app to users:** in Supabase → Authentication, turn
**off** public sign-ups and turn **on** email confirmation. The baseline
auto-promotes the first sign-in of `hyassuo@gmail.com` to admin (the
bootstrap account); every other account is created by an admin on the
**Users** page and starts inactive otherwise.

**Auth emails** (password reset, confirmation): Supabase's built-in mailer
only delivers to members of the project's team (2/hour), so configure a
custom SMTP server (Authentication → Emails → SMTP Settings). Under
Authentication → URL Configuration set the *Site URL* to the app's address
and add `https://<app>/auth/reset` to *Redirect URLs* (exact address, no
wildcards): reset links land there to set the new password.

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
  survives deletion, the storage-policy fix, the server-side draft sweep;
  details in its header). It depends on the v1.4 columns. If you ever
  re-run an older file (`security-fixes`, `hardening*`, `schema-v130/140`),
  re-run `hardening-5.sql` afterwards: older rounds redefine some objects
  with weaker versions.
- `rollback-v140.sql` refuses to run under round 5: restore a backup
  instead.

Then adopt the migration history once, so `supabase db push` only applies
future migrations, and check for drift. List every migration the database
already has: in production that includes the two of 29/09
(`20260929000000_rate_limits`, `20260929000100_active_reads_insert_audit`),
which were applied by hand in the SQL Editor:

```
supabase link --project-ref <ref>
supabase migration repair --status applied 20260928000000 20260928000100 20260929000000 20260929000100
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
- **Daily off-site copy**: `.github/workflows/backup.yml` runs
  `scripts/backup.sh`: a restorable data dump (`data.sql`), a full
  custom-format dump (`database.dump`, forensic) and every file of the
  `evidence-photos` bucket, packed and encrypted with
  [age](https://age-encryption.org), kept as a workflow artifact for 30
  days. It is off until you set the repository variable
  `BACKUP_ENABLED=true` and the secrets `SUPABASE_DB_URL` (the **session
  pooler** connection string: the direct `db.<ref>` host is IPv6-only and
  GitHub runners have no IPv6), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  and `BACKUP_AGE_RECIPIENT` (an age *public* key: keep the private key
  offline; it is the only way to restore).

**Restore** (into a new or emptied project; rehearse it once):

1. `age -d -i key.txt ss75-backup-….tar.gz.age | tar xz`
2. Create the schema: `supabase link --project-ref <ref> && supabase db push`.
3. `psql "<session pooler URL>" -f ss75-backup-…/data.sql`: data only,
   loaded with triggers off (`session_replication_role = replica`), so
   authorship/audit triggers neither rewrite nor duplicate history.
4. `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/restore-storage.mjs ss75-backup-…/storage`
   re-uploads the photos to the same paths.

## Tests

| Command | What it covers |
|---------|----------------|
| `npm test` | Vitest unit tests: domain logic (priority, dates across time zones, corrosion rate…), the item-form diff/rebase logic, CSV escaping, paging, redirects (`tests/*.test.ts`). |
| `npm run test:sql` | RLS / trigger regression suite (`tests/sql/run.sh`): spins up a throwaway PostgreSQL (needs the server binaries, e.g. `apt install postgresql`), loads a minimal Supabase stand-in and the schema files, then attacks the policies as each role: fresh install, the full upgrade chain, demo seed and rollback guard. |
| `npm run test:e2e` | End-to-end suite (`tests/e2e/`): builds the app and drives it in Chromium (Playwright) against a local Supabase stand-in: see below. |

CI (`.github/workflows/ci.yml`, least-privilege, actions pinned by SHA)
runs lint, typecheck, unit tests (also under four time zones), a
production build, `npm audit` (fails on high/critical in shipped
dependencies) and the SQL suite. Dependabot proposes dependency and action
updates (`.github/dependabot.yml`).


### End-to-end tests (`tests/e2e/`)

`npm run test:e2e` runs the production build of the app in Chromium against
a throwaway local stack: no Supabase project, Docker or secrets needed:

- **PostgreSQL** (`tests/sql/supabase-stub.sql` + `supabase/migrations/*.sql`,
  i.e. the real schema, triggers and RLS) plus the fixtures in
  `tests/e2e/sql/` (4 users, 1200+ items to exercise paging past the
  1000-row cap);
- **PostgREST v12** (downloaded once into `tests/e2e/.bin/`, checksum
  verified);
- **`tests/e2e/gateway.mjs`**, playing the Supabase API: proxies `/rest/v1`,
  implements the parts of GoTrue (`/auth/v1`) and Storage (`/storage/v1`)
  the app uses: Storage writes/reads/deletes `storage.objects` *as the
  caller*, so the real storage policies decide; GoTrue keeps per-user
  passwords and bans in `auth.users`, "sends" recovery emails to an outbox
  (`/__ctl/mail`) whose links redirect like the real `/verify`, signs
  sessions with the shared secret (HS256) or, switched per scenario
  (`/__ctl/jwt`), with an ES256 key published as a JWKS (asymmetric signing
  keys; PostgREST trusts both), and offers fault injection
  (HTTP errors, dropped connections, "commit then lose the response",
  delays) for the offline/concurrency scenarios;
- `next build` + `next start` with the local keys, then
  `tests/e2e/scenarios.mjs` (plain Playwright; results in
  `tests/e2e/artifacts/`: `results.json`, screenshots, logs, exports).

Scenarios cover the data-integrity flows (failed/lost saves, conflicts,
local drafts, cancel/delete guards and the audit trail, evidence upload and
cleanup under RLS, audit-log/CSV/XLSX exports), URL navigation and Back,
the accessible dialogs and confirmations, phone layout, offline, idle
sign-out, language and contrast; password reset (admin "Reset PW",
"Forgot password?", expired/forwarded links), deactivation ending sessions,
the photo-analysis role gate, the department scope of Risk Matrix /
Schedule / Export, and the corrosion-rate data rules. The browser enforces
the app's real Content-Security-Policy: any violation (a
`securitypolicyviolation` event or a "Refused to …" console report, popups
included) fails the scenario; `csp1`–`csp3` check the nonce policy itself,
the PDF export with a photo, and the offline page (direct and as the
service worker's fallback).

Setup: `npm ci`, then `cd tests/e2e && npm ci && npx playwright install
chromium` (Playwright and `pg` are harness-only dependencies with their own
lockfile, so the app's install stays lean). Needs the PostgreSQL server
binaries (`initdb`/`pg_ctl`, e.g. `apt install postgresql`); works as a
normal user or as root. Useful variables: `ONLY=c,d1` (subset),
`SKIP_BUILD=1`, `KEEP=1` (leave the stack up), `HEADED=1`, and
`PG_PORT`/`PGRST_PORT`/`GW_PORT`/`APP_PORT`/`E2E_TMP` (see
`tests/e2e/env.sh`). The run builds `.next` with the local stack's
`NEXT_PUBLIC_*` values: rebuild before deploying from the same checkout.
CI runs it on every pull request (`.github/workflows/e2e.yml`) and uploads
`tests/e2e/artifacts/` when it fails.

Load performance: `PERF=1 GW_LATENCY_MS=150 bash tests/e2e/run.sh` runs
`tests/e2e/perf.mjs` instead of the scenarios (login page bytes and TTFB,
sign-in → data on screen, opening the app, warm navigation), with every
Supabase request delayed by `GW_LATENCY_MS` in the gateway (test-only, to
make serial round-trips visible). Medians in the log, raw numbers in
`artifacts/perf.json`.

## Storage (evidence photos)

Inspection photos uploaded from the item modal go to the **private**
Supabase Storage bucket `evidence-photos`. Path convention:

```
{item_id}/{uuid}_{filename}
```

RLS scopes SELECT, INSERT and DELETE to the owning item's unit, so
photos never leak across units (see hardening round 5 for the
`objects.name` qualification this depends on).

Photos are only visible inside the signed-in session: the app never
creates a link to a file (no signed or public URLs). When an item is
opened, its photos are downloaded with the user's session
(`storage.download()`, JWT in the `Authorization` header, 4 at a time,
`cache: "no-store"`) and shown from `blob:` object URLs that exist only in
that tab's memory; closing the item revokes them. A photo opened in a new
tab gets its own `blob:` URL, revoked a minute later (the tab keeps
showing it; a reload finds nothing). PDF attachments download on the first
click. A file that fails to load (offline, storage error, no answer within
2 minutes) shows a message and a retry of its own. Only raster images
(JPEG, PNG, WebP, GIF, AVIF, HEIC) and PDFs are ever shown or opened, under
that type: a file stored as anything else (SVG, HTML…) gets no URL at all
and reads "file type not allowed": a `blob:` SVG/HTML document would run
in the app's own origin. The PDF export downloads with `no-store` too, so
no photo stays in the browser's HTTP cache. The service worker never
touches Supabase requests, so nothing lands in Cache Storage, and the
CSP's `img-src` does not list the Supabase origin at all. Taking photos out of the app is an
explicit action: the PDF export embeds them (with a note when some could
not be loaded). CSV/XLSX exports list file names only, never a link.

## PWA

The app is installable (Add to Home Screen / Install app):

- `app/manifest.ts` → served at `/manifest.webmanifest` (icons in
  `public/icons/`, generated from `app/icon.svg`).
- `public/sw.js`, a minimal service worker: network-first navigations with
  a branded offline page (`public/offline.html`); cache-first only for
  content-hashed build assets. **No page or API data is ever cached**:
  auth'd content stays fresh and private. Bump `VERSION` inside `sw.js`
  to force-invalidate the asset cache on a deploy.
- Registered by `components/layout/PwaRegister.tsx` (production only).
- The proxy (`proxy.ts`) matcher excludes `sw.js`, `manifest.webmanifest` and
  `offline.html`: they must load without a session.

## Deploy

Connected to Vercel via GitHub. The `main` branch is the production
branch: every push to `main` triggers a Vercel build that goes
directly to Production. Set the same env vars in
**Vercel → Project Settings → Environment Variables**.

Version is read from `package.json` and shown in the footer; bump it
following semver (patch / minor / major) before pushing a release.

---

Developed by Helcio Yassuo
