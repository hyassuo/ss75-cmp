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
--   20261030000100_no_bootstrap_admin.sql
--   20261030000200_history_author_privacy.sql
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

-- =============================================================================
-- 2) No hard-coded bootstrap admin (security audit C9)
--    (20261030000100_no_bootstrap_admin.sql)
-- =============================================================================
-- handle_new_user() made the account with one fixed email address an
-- ACTIVE ADMIN on its first sign-in. The address is public (so is this
-- repository): whoever registered it first, e.g. on a new project before
-- the owner, or wherever sign-ups or email changes are open, would own the
-- unit. Every new account is now an inactive viewer (the baseline already
-- said the special case could go once the first admin existed). The first
-- admin of a new project is promoted by hand in the SQL Editor (README,
-- "New project"); existing profiles are not touched.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  default_unit_id uuid;
BEGIN
  SELECT id INTO default_unit_id FROM public.units WHERE code = 'SS-75' LIMIT 1;

  -- New profiles are INACTIVE viewers. The admin "Create User" API route
  -- activates the ones it creates. This neutralises rogue public sign-ups:
  -- even if signups are enabled, a self-registered account can read nothing
  -- (RLS helpers + guards reject inactive users) until an admin activates it.
  INSERT INTO public.profiles (id, email, full_name, role, unit_id, active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'viewer',
    default_unit_id,
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- 3) Audit trail: colleagues' emails for admins only (security audit C9)
--    (20261030000200_history_author_privacy.sql)
-- =============================================================================
-- history.by_user_email was readable by every user of the unit (viewers and
-- inspectors too, through history_select_unit), while profiles were made
-- self-or-admin precisely so their emails would not leak. Now:
--
--   - history.by_user_name keeps the author's display name (their
--     profiles.full_name), captured when the event is written, so everyone
--     still sees who did what. Existing rows are backfilled from the
--     profiles that still exist.
--   - API roles may no longer SELECT history.by_user_email: SELECT on
--     history is granted per column, without it. (A column added to
--     history later is NOT readable by the app until it is granted here.)
--   - history_log is the table the app reads: the same rows (the caller's
--     RLS applies, security_invoker), with by_user_email filled in only for
--     an active admin of the row's unit (history_author_email()), NULL for
--     everyone else.

ALTER TABLE public.history ADD COLUMN IF NOT EXISTS by_user_name text;

-- Display name at write time. A separate BEFORE INSERT trigger, like
-- history_fill_snapshot, so no audit function needs to change.
CREATE OR REPLACE FUNCTION public.history_fill_author()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.by_user IS NOT NULL AND NEW.by_user_name IS NULL THEN
    SELECT NULLIF(btrim(p.full_name), '') INTO NEW.by_user_name
      FROM public.profiles p
     WHERE p.id = NEW.by_user;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.history_fill_author() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_history_author ON public.history;
CREATE TRIGGER trg_history_author
  BEFORE INSERT ON public.history
  FOR EACH ROW EXECUTE FUNCTION public.history_fill_author();

-- Backfill (the migration runs as the table owner; history stays
-- append-only for the API roles). Authors already deleted keep no name:
-- their rows show the email to admins only.
UPDATE public.history h
   SET by_user_name = NULLIF(btrim(p.full_name), '')
  FROM public.profiles p
 WHERE p.id = h.by_user
   AND h.by_user_name IS NULL;

-- Column-level SELECT: everything but by_user_email. Revoking the table
-- privilege also drops any column grants, so this is the complete list.
REVOKE SELECT ON public.history FROM anon, authenticated;
GRANT SELECT (id, item_id, item_ref, item_name, unit_id, event_date, action,
              field_changed, prev_value, new_value, note, by_user, by_user_name)
  ON public.history TO authenticated;

-- The author's email of one audit row, for an active admin of the row's
-- unit (same scope as history_select_unit); NULL for anyone else, so it
-- reveals nothing when called directly (/rpc/history_author_email).
CREATE OR REPLACE FUNCTION public.history_author_email(p_id uuid)
RETURNS text AS $$
  SELECT h.by_user_email
    FROM public.history h
   WHERE h.id = p_id
     AND public.current_user_role() = 'admin'
     AND (
       h.unit_id = public.current_user_unit()
       OR EXISTS (
         SELECT 1 FROM public.items i
          WHERE i.id = h.item_id
            AND i.unit_id = public.current_user_unit()
       )
     )
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.history_author_email(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.history_author_email(uuid) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.history_log WITH (security_invoker = true) AS
SELECT h.id, h.item_id, h.item_ref, h.item_name, h.unit_id, h.event_date,
       h.action, h.field_changed, h.prev_value, h.new_value, h.note,
       h.by_user, h.by_user_name,
       CASE WHEN (SELECT public.current_user_role()) = 'admin'
            THEN public.history_author_email(h.id)
       END AS by_user_email
  FROM public.history h;
-- Read-only, for signed-in users only (the default privileges would grant
-- every API role everything).
REVOKE ALL ON public.history_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.history_log TO authenticated, service_role;

COMMIT;


-- =============================================================================
-- VERIFICATION (expected: every row "true")
-- =============================================================================
SELECT 'last-admin trigger on profiles' AS check,
       (count(*) = 1)::text AS ok
  FROM pg_trigger WHERE tgname = 'trg_profiles_last_admin' AND NOT tgisinternal
UNION ALL
SELECT 'handle_new_user without a hard-coded admin',
       (prosrc !~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+[.][A-Za-z]')::text
  FROM pg_proc WHERE oid = 'public.handle_new_user()'::regprocedure
UNION ALL
SELECT 'history.by_user_email closed to the API roles',
       (NOT has_column_privilege('authenticated', 'public.history', 'by_user_email', 'SELECT')
        AND NOT has_column_privilege('anon', 'public.history', 'by_user_email', 'SELECT'))::text
UNION ALL
SELECT 'history_log view', (to_regclass('public.history_log') IS NOT NULL)::text
UNION ALL
SELECT 'author names backfilled', (count(*) = 0)::text
  FROM public.history h JOIN public.profiles p ON p.id = h.by_user
 WHERE h.by_user_name IS NULL AND NULLIF(btrim(p.full_name), '') IS NOT NULL;
