-- =============================================================================
-- SS-75 CMP — SECURITY HARDENING, ROUND 5
-- =============================================================================
-- In-place upgrade for databases created before v1.14.1. Idempotent — safe to
-- re-run. Already folded into supabase-setup.sql / supabase-ifs-schema.sql
-- for fresh installs.
--
-- RUN THIS LAST: supabase-security-fixes.sql and supabase-hardening-4.sql
-- redefine some of the objects below with their older (weaker) versions. If
-- you ever re-run one of those files, re-run this one afterwards.
--
-- Closes:
--   1. Immutable authorship. enforce_author() forced created_by only on
--      INSERT, so an inspector could PATCH created_by = <self> on any item
--      of the unit (unaudited) and then satisfy items_delete_creator.
--      created_by / created_at / unit_id are now frozen on UPDATE.
--   2. items_delete_creator now only covers what it was meant for:
--      discarding a fresh, never-named draft ("Untitled", < 24 h old).
--      Deleting a real item stays an admin-only action.
--   3. The audit trail survives item deletion. history.item_id was
--      ON DELETE CASCADE, so deleting an item erased its whole history and
--      the deletion itself left no trace. Now:
--        - FK is ON DELETE SET NULL; each row keeps item_ref (original id),
--          item_name and unit_id snapshots, filled by a trigger;
--        - a BEFORE DELETE trigger writes a 'deleted' event (who, when,
--          how many readings/evidences went with it);
--        - pristine drafts (Untitled, < 24 h, only the 'created' event) are
--          discarded quietly so cancelled "New Item" clicks don't flood the
--          audit log.
--      history visibility is scoped by the unit_id snapshot, so events of
--      deleted items stay readable by the unit.
--   4. profiles: admins could INSERT/DELETE profiles through PostgREST
--      (profiles_admin_all was FOR ALL; only UPDATE had been revoked),
--      bypassing the "last admin" / "no self-delete" guards of the
--      /api/users routes. Admin visibility is already granted by
--      profiles_select_self_or_admin, so the FOR ALL policy is dropped and
--      INSERT/DELETE revoked. Profile mutations go through the service-role
--      API routes only.
--   5. ifs_objects: the shared IFS register was writable by any admin of
--      any unit (ifs_objects_admin_all, FOR ALL without unit scope). It is
--      now read-only at runtime; refresh it via supabase-ifs-data.sql in
--      the SQL editor.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Immutable authorship on items
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_author()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_by := auth.uid();
    END IF;
    IF TG_TABLE_NAME = 'items' THEN
      NEW.updated_by := auth.uid();
      IF TG_OP = 'UPDATE' THEN
        NEW.created_by := OLD.created_by;
        NEW.created_at := OLD.created_at;
        NEW.unit_id    := OLD.unit_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- -----------------------------------------------------------------------------
-- 2. Creators may delete only fresh, never-named drafts
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "items_delete_creator" ON public.items;
CREATE POLICY "items_delete_creator" ON public.items
  FOR DELETE TO authenticated USING (
    created_by = auth.uid()
    AND name = 'Untitled'
    AND created_at > now() - interval '24 hours'
    AND public.current_user_role() IN ('admin', 'inspector')
    AND unit_id = public.current_user_unit()
  );


-- -----------------------------------------------------------------------------
-- 3. Audit trail survives item deletion
-- -----------------------------------------------------------------------------
ALTER TABLE public.history ADD COLUMN IF NOT EXISTS item_ref  uuid;
ALTER TABLE public.history ADD COLUMN IF NOT EXISTS item_name text;
-- No ON DELETE action: a unit that still has audit history cannot be
-- deleted by accident (or through units_admin_all).
ALTER TABLE public.history ADD COLUMN IF NOT EXISTS unit_id   uuid REFERENCES public.units(id);

UPDATE public.history h
SET item_ref  = COALESCE(h.item_ref, h.item_id),
    item_name = COALESCE(h.item_name, i.name),
    unit_id   = COALESCE(h.unit_id, i.unit_id)
FROM public.items i
WHERE i.id = h.item_id
  AND (h.item_ref IS NULL OR h.item_name IS NULL OR h.unit_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_history_unit ON public.history(unit_id);
CREATE INDEX IF NOT EXISTS idx_history_item_ref ON public.history(item_ref);

ALTER TABLE public.history ALTER COLUMN item_id DROP NOT NULL;
ALTER TABLE public.history DROP CONSTRAINT IF EXISTS history_item_id_fkey;
ALTER TABLE public.history
  ADD CONSTRAINT history_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE SET NULL;

-- Snapshot the item's identity on every audit row so it stays attributable
-- (and visible to its unit) after the item is gone.
CREATE OR REPLACE FUNCTION public.history_fill_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  NEW.item_ref := COALESCE(NEW.item_ref, NEW.item_id);
  IF NEW.item_id IS NOT NULL AND (NEW.unit_id IS NULL OR NEW.item_name IS NULL) THEN
    SELECT COALESCE(NEW.unit_id, i.unit_id), COALESCE(NEW.item_name, i.name)
      INTO NEW.unit_id, NEW.item_name
      FROM public.items i
     WHERE i.id = NEW.item_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_history_snapshot ON public.history;
CREATE TRIGGER trg_history_snapshot
  BEFORE INSERT ON public.history
  FOR EACH ROW EXECUTE FUNCTION public.history_fill_snapshot();

-- Record every item deletion. Runs BEFORE DELETE so the row (and its
-- readings/evidences) still exist to be counted and referenced.
CREATE OR REPLACE FUNCTION public.audit_item_delete()
RETURNS TRIGGER AS $$
DECLARE
  uid        uuid := auth.uid();
  user_email text;
  n_readings int;
  n_evidences int;
BEGIN
  -- A cancelled "New Item" draft: never named, fresh, and nothing but the
  -- 'created' event on record. Drop that event instead of logging noise.
  -- created_at is immutable (enforce_author), so an old item cannot be
  -- made to look like a draft.
  IF OLD.name = 'Untitled'
     AND OLD.created_at > now() - interval '24 hours'
     AND NOT EXISTS (
       SELECT 1 FROM public.history
       WHERE item_id = OLD.id AND action <> 'created'
     )
  THEN
    DELETE FROM public.history WHERE item_id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT email INTO user_email FROM public.profiles WHERE id = uid;
  SELECT count(*) INTO n_readings  FROM public.readings  WHERE item_id = OLD.id;
  SELECT count(*) INTO n_evidences FROM public.evidences WHERE item_id = OLD.id;

  INSERT INTO public.history
    (item_id, item_ref, item_name, unit_id, action, by_user, by_user_email, note)
  VALUES
    (OLD.id, OLD.id, OLD.name, OLD.unit_id, 'deleted', uid, user_email,
     format('Item deleted (%s readings, %s evidences removed)',
            n_readings, n_evidences));
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_audit_items_delete ON public.items;
CREATE TRIGGER trg_audit_items_delete
  BEFORE DELETE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.audit_item_delete();

-- Visibility by unit snapshot (falls back to the live item for any row the
-- backfill could not reach).
DROP POLICY IF EXISTS "history_select_unit" ON public.history;
CREATE POLICY "history_select_unit" ON public.history
  FOR SELECT TO authenticated USING (
    unit_id = public.current_user_unit()
    OR EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id = history.item_id
        AND items.unit_id = public.current_user_unit()
    )
  );

-- Append-only for API roles (RLS already denies; this is defence in depth).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.history FROM authenticated, anon;


-- -----------------------------------------------------------------------------
-- 4. profiles: no INSERT/DELETE through PostgREST
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
REVOKE INSERT, DELETE, TRUNCATE ON public.profiles FROM authenticated, anon;
REVOKE UPDATE ON public.profiles FROM anon;


-- -----------------------------------------------------------------------------
-- 5. ifs_objects: read-only at runtime
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "ifs_objects_admin_all" ON public.ifs_objects;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ifs_objects FROM authenticated, anon;


-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------
SELECT 'items_delete_creator' AS check, pg_get_expr(polqual, polrelid) AS definition
  FROM pg_policy WHERE polname = 'items_delete_creator'
UNION ALL
SELECT 'history FK', pg_get_constraintdef(oid)
  FROM pg_constraint WHERE conname = 'history_item_id_fkey'
UNION ALL
SELECT 'profiles_admin_all dropped', (count(*) = 0)::text
  FROM pg_policy WHERE polname = 'profiles_admin_all'
UNION ALL
SELECT 'ifs_objects_admin_all dropped', (count(*) = 0)::text
  FROM pg_policy WHERE polname = 'ifs_objects_admin_all';
