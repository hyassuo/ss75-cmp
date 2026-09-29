-- =============================================================================
-- SS-75 CMP — IFS Equipment Register table (run once)
-- =============================================================================
-- Creates the lookup table behind the IFS Object autocomplete in the item
-- modal. Replaces the previous AI-based stub (which hallucinated objects)
-- with a real, deterministic dataset.
--
-- Order:
--   1. Run this file (schema + RLS).
--   2. Run supabase/seed/ifs-data.sql (idempotent: TRUNCATE + INSERT 11k+ rows).
-- =============================================================================

-- Trigram index makes ILIKE / similarity matching fast over 11k+ rows.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.ifs_objects (
  id          text PRIMARY KEY,
  description text NOT NULL,
  sece        boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_ifs_objects_id_trgm
  ON public.ifs_objects USING gin (id gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_ifs_objects_desc_trgm
  ON public.ifs_objects USING gin (description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_ifs_objects_sece ON public.ifs_objects(sece);

-- Reference data: any authenticated user can read; writes are service
-- role / SQL editor only (the table is rebuilt from the IFS export).
ALTER TABLE public.ifs_objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ifs_objects_select_authenticated" ON public.ifs_objects;
-- Active users only (inactive accounts read nothing; see 20260929000100).
CREATE POLICY "ifs_objects_select_authenticated" ON public.ifs_objects
  FOR SELECT TO authenticated USING ((SELECT public.current_user_role()) IS NOT NULL);

-- No admin write policy (hardening round 5): the register is shared by all
-- units, and an unscoped admin policy let any unit's admin rewrite it
-- (e.g. flip SECE flags). Refresh it via supabase/seed/ifs-data.sql instead.
DROP POLICY IF EXISTS "ifs_objects_admin_all" ON public.ifs_objects;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ifs_objects FROM authenticated, anon;
