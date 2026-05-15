# SS-75 CMP — Corrosion Management Plan

Production rebuild of the SS-75 Noble Courage Corrosion Management Plan.
Next.js 14 (App Router, TypeScript strict) · Supabase (Postgres, Auth,
Storage) · Tailwind 3 · Anthropic API (IFS autocomplete + AI photo
analysis).

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
   - `NEXT_PUBLIC_APP_URL`
3. `npm run dev` → http://localhost:3000

The Supabase schema (7 tables, RLS, triggers, storage bucket, 1 unit +
14 DROPS zones) is already provisioned via `supabase-setup.sql` — do not
recreate it. The first sign-in for `hyassuo@gmail.com` is auto-promoted
to `admin`.

## Status

- Sprint 1 — Foundation (Next.js 14, Supabase wiring, domain logic)
- Sprint 2 — Auth + app shell + UI atoms
- Sprint 3 — Dashboard
- Sprint 4 — Zones & Items CRUD (modal, evidence, readings, IFS, AI)
- Sprint 5 — Risk Matrix + Schedule
- Sprint 6+ — Export (CSV/XLSX/PDF), User management, Audit log viewer

Business logic (`calcPriority`, `effectiveStatus`,
`calcNextInspection`, `itemScore`, `zoneScore`, `calcRate`) is preserved
exactly per the handoff. Deploy on Vercel; set the same env vars in
Project Settings.

Developed by Helcio Yassuo · Rev.01
