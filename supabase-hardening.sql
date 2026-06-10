-- =============================================================================
-- SS-75 CMP — SECURITY HARDENING ROUND 2 (run once in Supabase SQL Editor)
-- =============================================================================
-- Idempotent. Apply after supabase-setup.sql / supabase-security-fixes.sql.
--
-- FIX: rogue self-registration. If public sign-ups are ever enabled, the
-- handle_new_user trigger would create an ACTIVE profile in the SS-75 unit,
-- letting a stranger read all unit data. New profiles are now created
-- INACTIVE; only the admin "Create User" route activates them. Inactive
-- accounts are rejected by the RLS helpers and the app guards.
--
-- ALSO RECOMMENDED (dashboard, not SQL): Supabase → Authentication →
-- Providers → Email → turn OFF "Allow new users to sign up". User creation
-- is admin-only through the app.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  default_unit_id uuid;
  assigned_role user_role;
BEGIN
  SELECT id INTO default_unit_id FROM public.units WHERE code = 'SS-75' LIMIT 1;

  IF NEW.email = 'hyassuo@gmail.com' THEN
    assigned_role := 'admin';
  ELSE
    assigned_role := 'viewer';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, unit_id, active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    assigned_role,
    default_unit_id,
    (NEW.email = 'hyassuo@gmail.com')   -- bootstrap admin active; others inactive
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Existing users created before this change stay active. Nothing else to do.

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- After this runs, a brand-new sign-up (if signups are enabled) gets
-- active=false and cannot read any rows. Confirm with:
--   SELECT email, role, active FROM public.profiles ORDER BY created_at DESC;
-- =============================================================================
