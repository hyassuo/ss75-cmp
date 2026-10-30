-- =============================================================================
-- No hard-coded bootstrap admin (security audit C9)
-- =============================================================================
-- handle_new_user() made the account with one fixed email address an
-- ACTIVE ADMIN on its first sign-in. The address is public (so is this
-- repository): whoever registered it first, e.g. on a new project before
-- the owner, or wherever sign-ups or email changes are open, would own the
-- unit. Every new account is now an inactive viewer (the baseline already
-- said the special case could go once the first admin existed). The first
-- admin of a new project is promoted by hand in the SQL Editor (README,
-- "New project"); existing profiles are not touched.
--
-- Idempotent: safe to re-run.

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
