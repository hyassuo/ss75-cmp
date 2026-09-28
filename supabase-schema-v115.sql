-- =============================================================================
-- SS-75 CMP — SCHEMA v1.15.0 (data integrity)
-- =============================================================================
-- In-place upgrade for databases created before v1.15. Idempotent — safe to
-- re-run. Already folded into supabase-setup.sql for fresh installs.
-- Requires supabase-hardening-5.sql.
--
--   - readings.depth_mm must be >= 0. Added NOT VALID: enforced for every
--     new/changed row without failing on legacy data; run
--       ALTER TABLE public.readings VALIDATE CONSTRAINT readings_depth_nonneg;
--     once any negative legacy readings have been corrected.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'readings_depth_nonneg'
  ) THEN
    ALTER TABLE public.readings
      ADD CONSTRAINT readings_depth_nonneg CHECK (depth_mm >= 0) NOT VALID;
  END IF;
END $$;

SELECT conname, convalidated
  FROM pg_constraint WHERE conname = 'readings_depth_nonneg';
