-- =============================================================================
-- Audit trail: colleagues' emails for admins only (security audit C9)
-- =============================================================================
-- history.by_user_email was readable by every user of the unit (viewers and
-- inspectors too, through history_select_unit), while profiles were made
-- self-or-admin precisely so their emails would not leak. Now:
--
--   - history.by_user_name keeps the author's display name (their
--     profiles.full_name), captured when the event is written, so everyone
--     still sees who did what. Existing rows are backfilled from the
--     profiles that still exist. Users can no longer change their own
--     full_name through the API, so that name can't be borrowed.
--   - API roles may no longer SELECT history.by_user_email: SELECT on
--     history is granted per column, without it. (A column added to
--     history later is NOT readable by the app until it is granted here.)
--   - history_log is the table the app reads: the same rows (the caller's
--     RLS applies, security_invoker), with by_user_email filled in only for
--     an active admin of the row's unit (history_author_email()), NULL for
--     everyone else.
--
-- Idempotent: safe to re-run.

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

-- The name is now what non-admins see as the author, so a user may no
-- longer rename themselves through the API (the app never did: names are
-- set by an admin when the account is created). Otherwise an inspector
-- could take a colleague's name, make changes and take their own back,
-- and the trail would show the colleague to viewers and inspectors.
-- (dept stays editable by its owner.)
REVOKE UPDATE (full_name) ON public.profiles FROM authenticated, anon;

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
