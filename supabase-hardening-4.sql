-- =============================================================================
-- SS-75 CMP — SECURITY HARDENING ROUND 4 (run once in Supabase SQL Editor)
-- =============================================================================
-- Idempotent. Apply after supabase-hardening-3.sql.
--
-- FIX 1 (HIGH, multi-tenant) profiles RLS granted admins GLOBAL access. Two
--       permissive policies let any admin reach every unit's profiles,
--       regardless of the unit-scoping the admin API routes enforce
--       (an admin could bypass those routes by calling PostgREST directly
--       from the browser):
--         - profiles_select_self_or_admin: "id = auth.uid() OR role = admin"
--           let an admin SELECT all units' profiles (email / name leak).
--         - profiles_admin_all: "FOR ALL USING (role = admin)" let an admin
--           SELECT / UPDATE / DELETE / INSERT profiles in ANY unit. Column
--           grants still blocked role/active/unit_id changes, but SELECT,
--           DELETE, and full_name/dept UPDATE were not column-restricted —
--           so cross-unit enumeration, renaming and deletion were possible.
--       Both admin branches are now scoped to the admin's own unit. Users
--       keep visibility of their own profile. Single-unit (SS-75) deploys
--       are unaffected: every profile already shares that unit.
--
-- NOTE: the admin user-management API routes use the service-role client
--       (which bypasses RLS) and remain the only path that changes
--       role / active / unit_id. They already enforce the same unit check
--       in application code (v1.4.2), so this migration closes the direct
--       PostgREST gap underneath them.
--
-- FIX 2 (HIGH, multi-tenant) admin DELETE policies were not unit-scoped. An
--       admin could delete ANOTHER unit's items, readings, evidences and
--       evidence photos via direct PostgREST. (Item SELECT/UPDATE/INSERT and
--       the creator-delete path were already unit-scoped; only the
--       admin-delete branch and the child tables leaked.) Each admin-delete
--       policy is now bound to the admin's own unit. Single-unit deploys are
--       unaffected.
--
-- FIX 3 (HIGH, multi-tenant) units_admin_all was "FOR ALL USING(role=admin)"
--       — an admin could rename or DELETE any unit row via direct PostgREST,
--       and a unit delete cascades to that unit's profiles/items/etc. Scope
--       it to the admin's own unit: they may touch only their own unit row,
--       and can no longer create or remove other units.
--
-- FIX 4 (MED, multi-tenant) zones_admin_all let any admin INSERT/UPDATE/DELETE
--       the GLOBAL, shared zone catalog (Z01..Z14), affecting every unit. The
--       app never writes zones (read-only reference data), so runtime write
--       access is removed entirely; zone changes are now deliberate DB-admin /
--       migration operations via the service role. Reads (zones_select) stay.
-- =============================================================================

-- FIX 1 — profiles SELECT: admins see only their own unit ----------------------
DROP POLICY IF EXISTS "profiles_select_self_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_self_or_admin" ON public.profiles
  FOR SELECT TO authenticated USING (
    id = auth.uid()
    OR (
      public.current_user_role() = 'admin'
      AND unit_id = public.current_user_unit()
    )
  );

-- FIX 1 — profiles ALL (admin): scope every operation to the admin's unit -----
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'admin'
    AND unit_id = public.current_user_unit()
  )
  WITH CHECK (
    public.current_user_role() = 'admin'
    AND unit_id = public.current_user_unit()
  );

-- FIX 2 — admin DELETE scoped to the admin's own unit ------------------------
DROP POLICY IF EXISTS "items_delete_admin" ON public.items;
CREATE POLICY "items_delete_admin" ON public.items
  FOR DELETE TO authenticated USING (
    public.current_user_role() = 'admin'
    AND unit_id = public.current_user_unit()
  );

DROP POLICY IF EXISTS "readings_delete_admin" ON public.readings;
CREATE POLICY "readings_delete_admin" ON public.readings
  FOR DELETE TO authenticated USING (
    public.current_user_role() = 'admin'
    AND EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id = readings.item_id
        AND items.unit_id = public.current_user_unit()
    )
  );

DROP POLICY IF EXISTS "evidences_delete_admin" ON public.evidences;
CREATE POLICY "evidences_delete_admin" ON public.evidences
  FOR DELETE TO authenticated USING (
    public.current_user_role() = 'admin'
    AND EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id = evidences.item_id
        AND items.unit_id = public.current_user_unit()
    )
  );

DROP POLICY IF EXISTS "evidence_delete_admin" ON storage.objects;
CREATE POLICY "evidence_delete_admin" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'evidence-photos'
    AND public.current_user_role() = 'admin'
    AND EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id::text = (storage.foldername(name))[1]
        AND items.unit_id = public.current_user_unit()
    )
  );

-- FIX 3 — units: admin may touch only their own unit row ---------------------
DROP POLICY IF EXISTS "units_admin_all" ON public.units;
CREATE POLICY "units_admin_all" ON public.units
  FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'admin'
    AND id = public.current_user_unit()
  )
  WITH CHECK (
    public.current_user_role() = 'admin'
    AND id = public.current_user_unit()
  );

-- FIX 4 — zones: remove runtime write access (read-only reference data) -------
-- Dropping the policy leaves zones with only zones_select_authenticated, so
-- RLS denies INSERT/UPDATE/DELETE to all authenticated users. Manage zones
-- via the service role / SQL editor.
DROP POLICY IF EXISTS "zones_admin_all" ON public.zones;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- As an admin of unit A, via a direct PostgREST/client call:
-- 1) SELECT * FROM public.profiles;  -> returns only unit A profiles (+ self).
-- 2) DELETE FROM public.profiles WHERE id = '<unit-B-user>';  -> deletes 0 rows.
-- 3) UPDATE public.profiles SET full_name = 'x' WHERE id = '<unit-B-user>';
--    -> updates 0 rows.
-- 4) DELETE FROM public.items   WHERE id = '<unit-B-item>';  -> deletes 0 rows.
-- 5) DELETE FROM public.readings WHERE id = '<unit-B-reading>'; -> 0 rows.
-- Self-service (any role) still works:
-- 6) UPDATE public.profiles SET full_name = 'me' WHERE id = auth.uid();  -> ok.
-- And same-unit admin delete still works as before.
-- =============================================================================
