# SS-75 CMP — Corrosion Management Plan

Production rebuild of the SS-75 Noble Courage Corrosion Management Plan.
Next.js 14 (App Router, TypeScript strict) · Supabase (Postgres, Auth,
Storage) · Tailwind 3 · Gemini for AI photo analysis.

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
optionally `GEMINI_MODEL` (defaults to `gemini-2.0-flash`). AI output
is advisory triage only — item criticality is driven by the
deterministic risk matrix (P×C, SECE, overdue) plus quantitative
pit-depth readings.

## Supabase schema

Apply these files in order via the Supabase SQL Editor. Each is
idempotent — safe to re-run.

| File | Purpose |
|------|---------|
| `supabase-setup.sql` | Tables, RLS, triggers, storage bucket, 1 unit + 14 DROPS zones. The base. |
| `supabase-security-fixes.sql` | Round-1 hardening: SECURITY DEFINER on the audit trigger, column grants on `profiles`, scoped INSERTs, authorship trigger, storage SELECT by unit. |
| `supabase-hardening.sql` | Round-2 hardening: rogue-signup neutralisation (new profiles inactive); profiles SELECT limited to self + admins. |
| `supabase-hardening-3.sql` | Round-3 hardening: `WITH CHECK` on item updates (no silent unit transfers); storage uploads must target an item in the user's unit. |
| `supabase-ifs-schema.sql` | IFS Equipment Register table (id, description, sece) with pg_trgm indexes for fast autocomplete. |
| `supabase-ifs-data.sql` | TRUNCATE + INSERT of the 11,312-row IFS register. Refresh by re-running. |
| `supabase-demo-seed.sql` *(optional)* | ~25 demo items tagged `[DEMO]` for showcasing the dashboard / risk matrix / schedule. |

First sign-in for `hyassuo@gmail.com` is auto-promoted to `admin`.
All other accounts must be created by an admin via the **Users** page.

### Refreshing the IFS register

The IFS Equipment Register lives in `public.ifs_objects`. To refresh
from a new export:

1. Replace the upstream xlsx and run `node scripts/gen-ifs-seed.js` →
   regenerates `supabase-ifs-data.sql`.
2. Paste the new `supabase-ifs-data.sql` into the SQL Editor. The
   `TRUNCATE` at the top wipes the previous rows; the inserts re-seed
   in seconds. The `sece` flag in each row is the source of truth that
   the item modal reads when an Object is selected.

## Storage (evidence photos)

Inspection photos uploaded from the item modal go to the **private**
Supabase Storage bucket `evidence-photos`. Path convention:

```
{item_id}/{uuid}_{filename}
```

RLS scopes both SELECT and INSERT to the owning item's unit, so
photos never leak across units. Files are displayed in the modal via
short-lived signed URLs. The PDF export currently embeds only the
inspection metadata, not the images themselves.

## Deploy

Connected to Vercel via GitHub. The `main` branch is the production
branch — every push to `main` triggers a Vercel build that goes
directly to Production. Set the same env vars in
**Vercel → Project Settings → Environment Variables**.

Version is read from `package.json` and shown in the footer; bump it
following semver (patch / minor / major) before pushing a release.

---

Developed by Helcio Yassuo
