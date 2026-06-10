-- =============================================================================
-- SS-75 CMP — SECURITY FIXES (run once in Supabase SQL Editor)
-- =============================================================================
-- Applies on top of supabase-setup.sql. Idempotent — safe to re-run.
--
-- FIX 1  (CRITICAL) Privilege escalation via profiles_update_self:
--        the self-update RLS policy allowed a user to UPDATE any column of
--        their own profile — including role and active — so any viewer could
--        promote themselves to admin with a direct PostgREST call.
--        Fix: column-level grants. Authenticated users can only update
--        full_name and dept; role/active/unit_id changes go through the
--        admin API routes (service role).
--
-- FIX 2  Deactivated users keep a valid JWT until expiry; RLS never checked
--        profiles.active, so a deactivated inspector could keep writing.
--        Fix: helper functions return NULL when the profile is inactive,
--        which makes every policy that uses them deny access immediately.
--
-- FIX 3  readings/evidences INSERT policies only checked the role, not the
--        unit — an inspector could attach data to another unit's items.
--        Fix: WITH CHECK that the parent item belongs to the user's unit.
--
-- FIX 4  created_by / updated_by are client-supplied and spoofable.
--        Fix: trigger forces them to auth.uid() on authenticated writes
--        (service-role writes pass through unchanged).
--
-- FIX 5  Storage: any authenticated user could read every evidence photo.
--        Fix: SELECT restricted to photos whose folder ({item_id}/...) maps
--        to an item in the user's unit.
--
-- FIX 6  Inspectors could not delete their own just-created draft items
--        (Cancel on a new item), leaving orphan rows.
--        Fix: creators may delete items they created in their own unit.
-- =============================================================================


-- FIX 1 — profiles column-level grants ---------------------------------------
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, dept) ON public.profiles TO authenticated;

-- FIX 2 — inactive users lose all RLS-mediated access -------------------------
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND active = true
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.current_user_unit()
RETURNS uuid AS $$
  SELECT unit_id FROM public.profiles WHERE id = auth.uid() AND active = true
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- FIX 3 — child inserts must target items of the user's own unit -------------
DROP POLICY IF EXISTS "readings_insert_inspector_admin" ON public.readings;
CREATE POLICY "readings_insert_inspector_admin" ON public.readings
  FOR INSERT TO authenticated WITH CHECK (
    public.current_user_role() IN ('admin', 'inspector')
    AND EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id = readings.item_id
        AND items.unit_id = public.current_user_unit()
    )
  );

DROP POLICY IF EXISTS "evidences_insert_inspector_admin" ON public.evidences;
CREATE POLICY "evidences_insert_inspector_admin" ON public.evidences
  FOR INSERT TO authenticated WITH CHECK (
    public.current_user_role() IN ('admin', 'inspector')
    AND EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id = evidences.item_id
        AND items.unit_id = public.current_user_unit()
    )
  );

-- FIX 4 — server-enforced authorship ------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_author()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_by := auth.uid();
    END IF;
    IF TG_TABLE_NAME = 'items' THEN
      NEW.updated_by := auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_items_author ON public.items;
CREATE TRIGGER trg_items_author
  BEFORE INSERT OR UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_author();

DROP TRIGGER IF EXISTS trg_readings_author ON public.readings;
CREATE TRIGGER trg_readings_author
  BEFORE INSERT ON public.readings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_author();

DROP TRIGGER IF EXISTS trg_evidences_author ON public.evidences;
CREATE TRIGGER trg_evidences_author
  BEFORE INSERT ON public.evidences
  FOR EACH ROW EXECUTE FUNCTION public.enforce_author();

-- FIX 5 — evidence photos readable only within the owning unit ----------------
DROP POLICY IF EXISTS "evidence_select_authenticated" ON storage.objects;
CREATE POLICY "evidence_select_authenticated" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'evidence-photos'
    AND EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id::text = (storage.foldername(name))[1]
        AND items.unit_id = public.current_user_unit()
    )
  );

-- FIX 6 — creators may delete their own items in their own unit ---------------
DROP POLICY IF EXISTS "items_delete_creator" ON public.items;
CREATE POLICY "items_delete_creator" ON public.items
  FOR DELETE TO authenticated USING (
    created_by = auth.uid()
    AND public.current_user_role() IN ('admin', 'inspector')
    AND unit_id = public.current_user_unit()
  );

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- 1) As a non-admin user, this must FAIL with a permission error:
--      UPDATE public.profiles SET role = 'admin' WHERE id = auth.uid();
-- 2) As a non-admin user, this must SUCCEED:
--      UPDATE public.profiles SET full_name = 'Test' WHERE id = auth.uid();
-- 3) Deactivate a test user and confirm their item INSERTs are rejected
--    immediately (no need to wait for token expiry).
-- =============================================================================
