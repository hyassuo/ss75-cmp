-- =============================================================================
-- SS-75 CMP — SECURITY HARDENING ROUND 3 (run once in Supabase SQL Editor)
-- =============================================================================
-- Idempotent. Apply after supabase-hardening.sql.
--
-- FIX 1  (HIGH) items UPDATE had USING but no WITH CHECK. An inspector could
--        change unit_id on their own item to another unit's id — silently
--        transferring the item out of their visibility (and into another
--        unit's data if guessed correctly). Add WITH CHECK so the new row
--        must also belong to the user's unit.
--
-- FIX 2  (HIGH) storage INSERT on evidence-photos only checked the role,
--        not item ownership. An inspector could upload arbitrary files into
--        any folder, including {item_id}/ folders of other units or made-up
--        item ids — pollution + planting attacks against the audit trail.
--        Now the upload must target an item belonging to the user's unit.
--
-- FIX 3  (LOW)  storage UPDATE wasn't explicitly denied. With RLS enabled
--        and no UPDATE policy it already defaults to deny for authenticated;
--        we leave it that way (no policy created).
-- =============================================================================

-- FIX 1 — items UPDATE: prevent unit_id transfer ------------------------------
DROP POLICY IF EXISTS "items_update_inspector_admin" ON public.items;
CREATE POLICY "items_update_inspector_admin" ON public.items
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() IN ('admin', 'inspector')
    AND unit_id = public.current_user_unit()
  )
  WITH CHECK (
    public.current_user_role() IN ('admin', 'inspector')
    AND unit_id = public.current_user_unit()
  );

-- FIX 2 — storage INSERT: bind upload to item ownership ----------------------
DROP POLICY IF EXISTS "evidence_insert_inspector_admin" ON storage.objects;
CREATE POLICY "evidence_insert_inspector_admin" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'evidence-photos'
    AND public.current_user_role() IN ('admin', 'inspector')
    AND EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id::text = (storage.foldername(name))[1]
        AND items.unit_id = public.current_user_unit()
    )
  );

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- As an inspector logged in:
-- 1) UPDATE public.items SET unit_id = '<another-unit-uuid>' WHERE id = '...';
--    must FAIL ("new row violates row-level security policy").
-- 2) Uploading to bucket evidence-photos with a path like 'fake/file.jpg' or
--    '<another-units-item-id>/x.jpg' must FAIL.
-- =============================================================================
