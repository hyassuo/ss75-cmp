-- =============================================================================
-- Reference tables for active users only (backlog C6)
-- Audit trail records added readings and evidence (backlog D2)
-- =============================================================================
-- Idempotent: safe to re-run.

-- ── C6 ────────────────────────────────────────────────────────────────────────
-- units, zones and ifs_objects were readable by any signed-in account,
-- including one that is inactive (a pending sign-up, a deactivated user).
-- current_user_role() is NULL for those, so they now read nothing — like
-- every other table. Any older SELECT policy on these tables (whatever its
-- name, from earlier setup/upgrade files) is dropped first: permissive
-- policies are OR-ed, so a leftover USING (true) would keep them open.
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('units', 'zones', 'ifs_objects')
      AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

CREATE POLICY "units_select_authenticated" ON public.units
  FOR SELECT TO authenticated USING (public.current_user_role() IS NOT NULL);
CREATE POLICY "zones_select_authenticated" ON public.zones
  FOR SELECT TO authenticated USING (public.current_user_role() IS NOT NULL);
DO $$ BEGIN
  -- ifs_objects comes from 20260928000100_ifs_register.sql.
  IF to_regclass('public.ifs_objects') IS NOT NULL THEN
    CREATE POLICY "ifs_objects_select_authenticated" ON public.ifs_objects
      FOR SELECT TO authenticated USING (public.current_user_role() IS NOT NULL);
  END IF;
END $$;

-- ── D2 ────────────────────────────────────────────────────────────────────────
-- Adding a reading or an evidence record now leaves an audit event, like
-- removing one already did (audit_child_delete). history_fill_snapshot
-- stamps the item's name and unit on the row.
--
-- A "New Item" draft stays a draft while only readings/evidences change:
-- is_pristine_draft ignores their audit events (same body as the baseline).
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
  -- Readings/evidences don't count (above), so neither do their audit
  -- events: adding (or adding then removing) a photo keeps it a draft.
  AND NOT EXISTS (
    SELECT 1 FROM public.history h
    WHERE h.item_id = p_item
      AND h.action NOT IN ('created', 'reading_added', 'reading_deleted',
                           'evidence_added', 'evidence_deleted')
  )
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

CREATE OR REPLACE FUNCTION public.audit_child_insert()
RETURNS TRIGGER AS $$
DECLARE
  uid        uuid := auth.uid();
  user_email text;
BEGIN
  SELECT email INTO user_email FROM public.profiles WHERE id = uid;
  IF TG_TABLE_NAME = 'readings' THEN
    INSERT INTO public.history
      (item_id, action, field_changed, new_value, by_user, by_user_email, note)
    VALUES
      (NEW.item_id, 'reading_added', 'depth_mm', NEW.depth_mm::text, uid, user_email,
       format('Reading added: %s mm on %s%s', NEW.depth_mm, NEW.reading_date,
              COALESCE(' at ' || NEW.location, '')));
  ELSE
    INSERT INTO public.history
      (item_id, action, field_changed, new_value, by_user, by_user_email, note)
    VALUES
      (NEW.item_id, 'evidence_added', 'file_path', NEW.file_path, uid, user_email,
       format('Evidence added: %s — %s', NEW.evidence_date,
              COALESCE(NEW.description, '')));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.audit_child_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_readings_insert ON public.readings;
CREATE TRIGGER trg_audit_readings_insert
  AFTER INSERT ON public.readings
  FOR EACH ROW EXECUTE FUNCTION public.audit_child_insert();
DROP TRIGGER IF EXISTS trg_audit_evidences_insert ON public.evidences;
CREATE TRIGGER trg_audit_evidences_insert
  AFTER INSERT ON public.evidences
  FOR EACH ROW EXECUTE FUNCTION public.audit_child_insert();
