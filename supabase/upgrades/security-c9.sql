-- =============================================================================
-- SS-75 CMP: SECURITY AUDIT C9 (v1.22.0): run once in the Supabase SQL Editor
-- =============================================================================
-- In-place upgrade for the production database (created from
-- supabase/migrations/, with the two migrations of 29/09 applied by hand).
-- Idempotent: safe to re-run. It is the SQL of the C9 migrations below, in
-- order, for pasting into the SQL Editor, inside one transaction (an error
-- leaves the database as it was); tests/sql/run.sh checks that this file
-- and those migrations leave identical schemas:
--
--   20261030000000_last_admin_guard.sql
--
-- Run it BEFORE deploying v1.22.0 (docs/BACKLOG.md, owner actions).
-- =============================================================================

BEGIN;

-- 0) Guard ---------------------------------------------------------------------
-- Builds on security round 5 and the migrations of 29/09.
DO $$
BEGIN
  IF to_regprocedure('public.is_pristine_draft(uuid)') IS NULL
     OR to_regprocedure('public.audit_child_insert()') IS NULL
     OR to_regprocedure('public.rate_limit_hit(text, integer, integer)') IS NULL
  THEN
    RAISE EXCEPTION
      'security-c9.sql needs security round 5 and the migrations of 29/09 (20260929000000_rate_limits, 20260929000100_active_reads_insert_audit) first. Nothing was changed.';
  END IF;
END $$;


-- =============================================================================
-- 1) Every unit keeps an active admin (security audit C9)
--    (20261030000000_last_admin_guard.sql)
-- =============================================================================
-- The /api/users routes refuse to demote, deactivate or delete the last
-- active admin of a unit, but they count first and write afterwards: two
-- admins demoting each other at the same moment could both pass the count
-- and leave the unit with no admin. The rule now also lives here, under a
-- lock per unit, so such changes are decided one after the other. The
-- routes keep their own check as the friendly first answer; this trigger
-- is the one that can't be raced, and it also covers a delete cascading
-- from auth.users (the delete route goes through the Auth admin API) and
-- SQL run by hand. To retire a unit's last admin on purpose, promote
-- another user first.

CREATE OR REPLACE FUNCTION public.guard_last_admin()
RETURNS TRIGGER AS $$
BEGIN
  -- Only a change that takes an active admin away from its unit matters:
  -- demotion, deactivation, a move to another unit, or deletion.
  IF OLD.role IS DISTINCT FROM 'admin' OR NOT COALESCE(OLD.active, false) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.role = 'admin' AND COALESCE(NEW.active, false)
       AND NEW.unit_id IS NOT DISTINCT FROM OLD.unit_id
    THEN
      RETURN NEW;
    END IF;
  END IF;

  -- One such change per unit at a time: a concurrent one waits here until
  -- this transaction ends, then counts what is left (READ COMMITTED: the
  -- query below takes a fresh snapshot after the wait).
  PERFORM pg_advisory_xact_lock(
    hashtext('public.guard_last_admin'),
    hashtext(COALESCE(OLD.unit_id::text, ''))
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.role = 'admin'
       AND COALESCE(p.active, false)
       AND p.unit_id IS NOT DISTINCT FROM OLD.unit_id
       AND p.id <> OLD.id
  ) THEN
    RAISE EXCEPTION 'last active admin of the unit: % cannot be demoted, deactivated or deleted', OLD.id
      USING ERRCODE = 'check_violation',
            HINT = 'Make another user of the unit an active admin first.';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- SECURITY DEFINER: the count must see every profile of the unit whoever
-- makes the change (the Auth service deleting a user, the service role).
REVOKE EXECUTE ON FUNCTION public.guard_last_admin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_profiles_last_admin ON public.profiles;
CREATE TRIGGER trg_profiles_last_admin
  BEFORE UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_last_admin();

COMMIT;


-- =============================================================================
-- VERIFICATION (expected: every row "true")
-- =============================================================================
SELECT 'last-admin trigger on profiles' AS check,
       (count(*) = 1)::text AS ok
  FROM pg_trigger WHERE tgname = 'trg_profiles_last_admin' AND NOT tgisinternal;
