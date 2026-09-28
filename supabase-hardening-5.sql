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
--   1. Server-owned timestamps and authorship. enforce_author() forced
--      created_by only on INSERT, so an inspector could PATCH
--      created_by = <self> onto any item (unaudited) and satisfy
--      items_delete_creator; created_at could be forged on INSERT too.
--      Now created_by / created_at (and items.updated_at) are set by the
--      server on INSERT and frozen, together with unit_id, on UPDATE.
--   2. items_delete_creator only covers what it was meant for: discarding
--      a "pristine draft" — the exact stub row the app inserts for a new
--      item (name 'Untitled', status Pending, every content field empty)
--      that nobody has edited since (no audit event besides 'created').
--      Deleting a real item is an admin-only action.
--   3. The audit trail survives item deletion. history.item_id was
--      ON DELETE CASCADE, so deleting an item erased its whole history and
--      the deletion itself left no trace. Now:
--        - FK is ON DELETE SET NULL; each row keeps item_ref (original id),
--          item_name and unit_id snapshots, filled by a trigger;
--        - a BEFORE DELETE trigger writes a 'deleted' event (who, when,
--          how many readings/evidences went with it). Only a pristine
--          draft with no readings/evidences is discarded without a trace
--          (so cancelled "New Item" clicks don't flood the audit log);
--        - name, zone and the other descriptive fields the v1.4 audit
--          trigger ignored are now audited too (so an item cannot be
--          quietly renamed back to 'Untitled' to pass as a draft);
--        - history.by_user is ON DELETE SET NULL (by_user_email keeps the
--          attribution), so a permanent trail doesn't block user deletion.
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
-- 1. Server-owned authorship and timestamps
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_author()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_by := auth.uid();
      NEW.created_at := now();
    END IF;
    IF TG_TABLE_NAME = 'items' THEN
      NEW.updated_by := auth.uid();
      IF TG_OP = 'INSERT' THEN
        NEW.updated_at := now();
      ELSE
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
-- 2. Pristine drafts — the only items a non-admin may delete
-- -----------------------------------------------------------------------------
-- True for the stub row the app inserts when "New Item" is clicked, as long
-- as nobody has saved anything onto it: every content field is still empty
-- and the audit log holds nothing but its 'created' event. Readings and
-- evidences are NOT considered here (a user may attach a photo and then
-- cancel); audit_item_delete logs the deletion whenever any exist.
CREATE OR REPLACE FUNCTION public.is_pristine_draft(p_item uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.id = p_item
      AND i.name = 'Untitled'
      AND COALESCE(i.status::text, 'Pending') = 'Pending'
      AND i.subarea_id IS NULL
      AND i.mechanism IS NULL AND i.protection IS NULL
      AND i.ifs_obj_id IS NULL AND i.ifs_obj_desc IS NULL
      AND i.ifs_wo IS NULL AND i.ifs_fl IS NULL
      AND i.prob IS NULL AND i.cons IS NULL AND i.priority IS NULL
      AND NOT COALESCE(i.sece, false)
      AND NOT COALESCE(i.drops_risk, false)
      AND NOT COALESCE(i.structural, false)
      AND i.obs_source IS NULL AND i.freq_insp IS NULL
      AND i.last_insp IS NULL AND i.next_insp IS NULL
      AND i.resolved_at IS NULL
      AND NOT COALESCE(i.archived, false)
      AND i.action_type IS NULL AND i.action_due IS NULL
      AND i.action_status IS NULL AND i.action_note IS NULL
      AND i.corr_extent_band IS NULL AND i.material_loss_band IS NULL
      AND NOT COALESCE(i.is_accessory, false)
      AND i.accessory_type IS NULL
      AND i.notes IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.history h
    WHERE h.item_id = p_item AND h.action <> 'created'
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "items_delete_creator" ON public.items;
CREATE POLICY "items_delete_creator" ON public.items
  FOR DELETE TO authenticated USING (
    created_by = auth.uid()
    AND public.current_user_role() IN ('admin', 'inspector')
    AND unit_id = public.current_user_unit()
    AND public.is_pristine_draft(id)
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
ALTER TABLE public.history DROP CONSTRAINT IF EXISTS history_by_user_fkey;
ALTER TABLE public.history
  ADD CONSTRAINT history_by_user_fkey
  FOREIGN KEY (by_user) REFERENCES public.profiles(id) ON DELETE SET NULL;

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

-- Descriptive fields the v1.4 audit trigger (audit_item_changes) does not
-- cover. Kept in a separate trigger so re-running supabase-schema-v130.sql /
-- v140.sql (which redefine audit_item_changes) cannot drop it.
CREATE OR REPLACE FUNCTION public.audit_item_identity()
RETURNS TRIGGER AS $$
DECLARE
  user_email text;
BEGIN
  SELECT email INTO user_email FROM public.profiles WHERE id = NEW.updated_by;
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
    VALUES (NEW.id, 'renamed', 'name', OLD.name, NEW.name, NEW.updated_by, user_email);
  END IF;
  IF OLD.zone_id IS DISTINCT FROM NEW.zone_id THEN
    INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
    VALUES (NEW.id, 'zone_changed', 'zone_id', OLD.zone_id, NEW.zone_id, NEW.updated_by, user_email);
  END IF;
  IF OLD.mechanism IS DISTINCT FROM NEW.mechanism THEN
    INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
    VALUES (NEW.id, 'mechanism_changed', 'mechanism', OLD.mechanism, NEW.mechanism, NEW.updated_by, user_email);
  END IF;
  IF OLD.protection IS DISTINCT FROM NEW.protection THEN
    INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
    VALUES (NEW.id, 'protection_changed', 'protection', OLD.protection, NEW.protection, NEW.updated_by, user_email);
  END IF;
  IF OLD.ifs_obj_id IS DISTINCT FROM NEW.ifs_obj_id THEN
    INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
    VALUES (NEW.id, 'ifs_object_changed', 'ifs_obj_id', OLD.ifs_obj_id, NEW.ifs_obj_id, NEW.updated_by, user_email);
  END IF;
  IF OLD.ifs_wo IS DISTINCT FROM NEW.ifs_wo THEN
    INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
    VALUES (NEW.id, 'ifs_wo_changed', 'ifs_wo', OLD.ifs_wo, NEW.ifs_wo, NEW.updated_by, user_email);
  END IF;
  IF OLD.ifs_fl IS DISTINCT FROM NEW.ifs_fl THEN
    INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
    VALUES (NEW.id, 'ifs_fl_changed', 'ifs_fl', OLD.ifs_fl, NEW.ifs_fl, NEW.updated_by, user_email);
  END IF;
  IF OLD.action_note IS DISTINCT FROM NEW.action_note THEN
    INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
    VALUES (NEW.id, 'action_note_changed', 'action_note', OLD.action_note, NEW.action_note, NEW.updated_by, user_email);
  END IF;
  IF OLD.notes IS DISTINCT FROM NEW.notes THEN
    INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
    VALUES (NEW.id, 'notes_changed', 'notes', OLD.notes, NEW.notes, NEW.updated_by, user_email);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_audit_items_identity ON public.items;
CREATE TRIGGER trg_audit_items_identity
  AFTER UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.audit_item_identity();

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
  SELECT count(*) INTO n_readings  FROM public.readings  WHERE item_id = OLD.id;
  SELECT count(*) INTO n_evidences FROM public.evidences WHERE item_id = OLD.id;

  -- A cancelled "New Item" that never held anything: drop its 'created'
  -- event instead of logging noise.
  IF n_readings = 0 AND n_evidences = 0 AND public.is_pristine_draft(OLD.id) THEN
    DELETE FROM public.history WHERE item_id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT email INTO user_email FROM public.profiles WHERE id = uid;
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
-- 5. ifs_objects: read-only at runtime (skipped if the IFS table isn't
--    installed yet — supabase-ifs-schema.sql carries the same rule)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.ifs_objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS "ifs_objects_admin_all" ON public.ifs_objects;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ifs_objects FROM authenticated, anon;
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------
SELECT 'items_delete_creator' AS check, pg_get_expr(polqual, polrelid) AS definition
  FROM pg_policy WHERE polname = 'items_delete_creator'
UNION ALL
SELECT 'history FK', pg_get_constraintdef(oid)
  FROM pg_constraint WHERE conname = 'history_item_id_fkey'
UNION ALL
SELECT 'delete/identity audit triggers', count(*)::text
  FROM pg_trigger WHERE tgname IN ('trg_audit_items_delete', 'trg_audit_items_identity')
UNION ALL
SELECT 'profiles_admin_all dropped', (count(*) = 0)::text
  FROM pg_policy WHERE polname = 'profiles_admin_all'
UNION ALL
SELECT 'ifs_objects_admin_all dropped', (count(*) = 0)::text
  FROM pg_policy WHERE polname = 'ifs_objects_admin_all';
