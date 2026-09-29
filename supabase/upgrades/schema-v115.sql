-- =============================================================================
-- SS-75 CMP: SCHEMA v1.15.0 (data integrity)
-- =============================================================================
-- In-place upgrade for databases created before v1.15. Idempotent: safe to
-- re-run. Already folded into supabase/migrations/20260928000000_baseline.sql for fresh installs.
-- Requires supabase/upgrades/hardening-5.sql.
--
--   - readings.depth_mm must be >= 0. Added NOT VALID: enforced for every
--     new/changed row without failing on legacy data; run
--       ALTER TABLE public.readings VALIDATE CONSTRAINT readings_depth_nonneg;
--     once any negative legacy readings have been corrected.
--   - evidences.file_path must live in the evidence's own item folder
--     ("<item_id>/…"). Otherwise an evidence row could point at another
--     item's photo, and deleting that evidence would delete the other
--     item's file. NOT VALID for the same reason as above.
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'evidences_file_in_item_folder'
  ) THEN
    ALTER TABLE public.evidences
      ADD CONSTRAINT evidences_file_in_item_folder
      CHECK (file_path IS NULL OR file_path LIKE item_id::text || '/%') NOT VALID;
  END IF;
END $$;

SELECT conname, convalidated
  FROM pg_constraint
 WHERE conname IN ('readings_depth_nonneg', 'evidences_file_in_item_folder');
