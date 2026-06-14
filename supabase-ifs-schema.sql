-- =============================================================================
-- SS-75 CMP — IFS Equipment Register table (run once)
-- =============================================================================
-- Creates the lookup table behind the IFS Object autocomplete in the item
-- modal. Replaces the previous AI-based stub (which hallucinated objects)
-- with a real, deterministic dataset.
--
-- Order:
--   1. Run this file (schema + RLS).
--   2. Run supabase-ifs-data.sql (idempotent: TRUNCATE + INSERT 11k+ rows).
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

-- Reference data: any authenticated user can read; writes are admin/service
-- role only (the table is rebuilt from the IFS export, not edited by hand).
ALTER TABLE public.ifs_objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ifs_objects_select_authenticated" ON public.ifs_objects;
CREATE POLICY "ifs_objects_select_authenticated" ON public.ifs_objects
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ifs_objects_admin_all" ON public.ifs_objects;
CREATE POLICY "ifs_objects_admin_all" ON public.ifs_objects
  FOR ALL TO authenticated USING (public.current_user_role() = 'admin');
