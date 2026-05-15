-- =============================================================================
-- SS-75 CORROSION MANAGEMENT PLAN — SUPABASE SETUP
-- =============================================================================
-- Project:    ss75-cmp
-- Author:     Helcio Yassuo
-- Database:   PostgreSQL 15+ (Supabase managed)
-- Tables:     7 (units, profiles, zones, items, readings, evidences, history)
-- Storage:    1 bucket (evidence-photos)
-- Seed:       Structural only (1 unit, 14 DROPS zones). No sample data.
--
-- Execution:  Paste this entire file in Supabase SQL Editor and click "Run".
--
-- NOTE: audit_item_changes() is SECURITY DEFINER so the audit trigger can
--       write to public.history (which has no INSERT policy by design — it
--       is an append-only log written only by the trigger). Without
--       SECURITY DEFINER, INSERTs fail with "new row violates row-level
--       security policy for table history".
-- =============================================================================


-- =============================================================================
-- SECTION 1 — EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- =============================================================================
-- SECTION 2 — ENUMS
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'inspector', 'viewer');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE item_priority AS ENUM ('Critical', 'High', 'Medium', 'Low');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE item_status AS ENUM ('OK', 'Attention', 'Critical', 'Pending');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE inspection_frequency AS ENUM (
    'Weekly', 'Monthly', 'Quarterly', 'Semi-annual', 'Annual',
    'Every 2 years', 'Every 2.5 years', 'Every 5 years',
    'Per operation', 'As required'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;


-- =============================================================================
-- SECTION 3 — TABLES
-- =============================================================================

-- units: drilling units / rigs (multi-tenant ready for future NS-59)
CREATE TABLE IF NOT EXISTS public.units (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        text UNIQUE NOT NULL,
  name        text NOT NULL,
  type        text,
  active      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- profiles: extends auth.users with role, dept and unit
CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email       text UNIQUE NOT NULL,
  full_name   text,
  role        user_role NOT NULL DEFAULT 'viewer',
  dept        text,
  unit_id     uuid REFERENCES public.units(id),
  active      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_unit ON public.profiles(unit_id);

-- zones: fixed DROPS zones (Z01..Z14) from HSE_7100.0_I
CREATE TABLE IF NOT EXISTS public.zones (
  zid           text PRIMARY KEY,
  name          text NOT NULL,
  description   text,
  system        text NOT NULL,
  default_freq  inspection_frequency,
  drops_zone    boolean DEFAULT false,
  display_order int
);
CREATE INDEX IF NOT EXISTS idx_zones_system ON public.zones(system);

-- items: corrosion inspection points (core entity)
CREATE TABLE IF NOT EXISTS public.items (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id         uuid NOT NULL REFERENCES public.units(id),
  zone_id         text NOT NULL REFERENCES public.zones(zid),
  name            text NOT NULL,
  mechanism       text,
  protection      text,
  ifs_obj_id      text,
  ifs_obj_desc    text,
  ifs_wo          text,
  ifs_fl          text,
  prob            int CHECK (prob BETWEEN 1 AND 5),
  cons            int CHECK (cons BETWEEN 1 AND 5),
  priority        item_priority,
  status          item_status DEFAULT 'Pending',
  sece            boolean DEFAULT false,
  freq_insp       inspection_frequency,
  last_insp       date,
  next_insp       date,
  resolved_at     date,
  archived        boolean DEFAULT false,
  notes           text,
  created_by      uuid REFERENCES public.profiles(id),
  updated_by      uuid REFERENCES public.profiles(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_items_unit ON public.items(unit_id);
CREATE INDEX IF NOT EXISTS idx_items_zone ON public.items(zone_id);
CREATE INDEX IF NOT EXISTS idx_items_status ON public.items(status);
CREATE INDEX IF NOT EXISTS idx_items_priority ON public.items(priority);
CREATE INDEX IF NOT EXISTS idx_items_next_insp ON public.items(next_insp);
CREATE INDEX IF NOT EXISTS idx_items_archived ON public.items(archived);
CREATE INDEX IF NOT EXISTS idx_items_sece ON public.items(sece);

-- readings: pit depth measurements
CREATE TABLE IF NOT EXISTS public.readings (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id      uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  reading_date date NOT NULL,
  depth_mm     numeric(6,3) NOT NULL,
  location     text,
  checked_by   text,
  created_by   uuid REFERENCES public.profiles(id),
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_readings_item ON public.readings(item_id);
CREATE INDEX IF NOT EXISTS idx_readings_date ON public.readings(reading_date);

-- evidences: photos and attachments
CREATE TABLE IF NOT EXISTS public.evidences (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id       uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  evidence_date date NOT NULL,
  description   text,
  file_url      text,
  file_path     text,
  file_name     text,
  file_type     text,
  file_size     int,
  ai_analysis   jsonb,
  created_by    uuid REFERENCES public.profiles(id),
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evidences_item ON public.evidences(item_id);

-- history: granular audit log
CREATE TABLE IF NOT EXISTS public.history (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id       uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  event_date    timestamptz DEFAULT now(),
  action        text NOT NULL,
  field_changed text,
  prev_value    text,
  new_value     text,
  note          text,
  by_user       uuid REFERENCES public.profiles(id),
  by_user_email text
);
CREATE INDEX IF NOT EXISTS idx_history_item ON public.history(item_id);
CREATE INDEX IF NOT EXISTS idx_history_date ON public.history(event_date DESC);


-- =============================================================================
-- SECTION 4 — TRIGGERS: updated_at + audit log
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_items_updated_at ON public.items;
CREATE TRIGGER trg_items_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.audit_item_changes()
RETURNS TRIGGER AS $$
DECLARE
  user_email text;
BEGIN
  SELECT email INTO user_email FROM public.profiles WHERE id = NEW.updated_by;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.history (item_id, action, by_user, by_user_email, note)
    VALUES (NEW.id, 'created', NEW.created_by, user_email, 'Item created');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.priority IS DISTINCT FROM NEW.priority THEN
      INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
      VALUES (NEW.id, 'priority_changed', 'priority', OLD.priority::text, NEW.priority::text, NEW.updated_by, user_email);
    END IF;
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
      VALUES (NEW.id, 'status_changed', 'status', OLD.status::text, NEW.status::text, NEW.updated_by, user_email);
    END IF;
    IF OLD.prob IS DISTINCT FROM NEW.prob THEN
      INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
      VALUES (NEW.id, 'probability_changed', 'prob', OLD.prob::text, NEW.prob::text, NEW.updated_by, user_email);
    END IF;
    IF OLD.cons IS DISTINCT FROM NEW.cons THEN
      INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
      VALUES (NEW.id, 'consequence_changed', 'cons', OLD.cons::text, NEW.cons::text, NEW.updated_by, user_email);
    END IF;
    IF OLD.sece IS DISTINCT FROM NEW.sece THEN
      INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
      VALUES (NEW.id, 'sece_changed', 'sece', OLD.sece::text, NEW.sece::text, NEW.updated_by, user_email);
    END IF;
    IF OLD.next_insp IS DISTINCT FROM NEW.next_insp THEN
      INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
      VALUES (NEW.id, 'next_inspection_changed', 'next_insp', OLD.next_insp::text, NEW.next_insp::text, NEW.updated_by, user_email);
    END IF;
    IF OLD.last_insp IS DISTINCT FROM NEW.last_insp THEN
      INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
      VALUES (NEW.id, 'last_inspection_changed', 'last_insp', OLD.last_insp::text, NEW.last_insp::text, NEW.updated_by, user_email);
    END IF;
    IF OLD.freq_insp IS DISTINCT FROM NEW.freq_insp THEN
      INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
      VALUES (NEW.id, 'frequency_changed', 'freq_insp', OLD.freq_insp::text, NEW.freq_insp::text, NEW.updated_by, user_email);
    END IF;
    IF OLD.resolved_at IS DISTINCT FROM NEW.resolved_at THEN
      INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email, note)
      VALUES (NEW.id,
              CASE WHEN NEW.resolved_at IS NOT NULL THEN 'resolved' ELSE 'reopened' END,
              'resolved_at', OLD.resolved_at::text, NEW.resolved_at::text,
              NEW.updated_by, user_email,
              CASE WHEN NEW.resolved_at IS NOT NULL THEN 'Item marked as resolved' ELSE 'Item reopened' END);
    END IF;
    IF OLD.archived IS DISTINCT FROM NEW.archived THEN
      INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email, note)
      VALUES (NEW.id,
              CASE WHEN NEW.archived THEN 'archived' ELSE 'unarchived' END,
              'archived', OLD.archived::text, NEW.archived::text,
              NEW.updated_by, user_email,
              CASE WHEN NEW.archived THEN 'Item archived' ELSE 'Item unarchived' END);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_audit_items ON public.items;
CREATE TRIGGER trg_audit_items
  AFTER INSERT OR UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.audit_item_changes();


-- =============================================================================
-- SECTION 5 — AUTH HOOK: auto-create profile on signup
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

  INSERT INTO public.profiles (id, email, full_name, role, unit_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    assigned_role,
    default_unit_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- =============================================================================
-- SECTION 6 — ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.units      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zones      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.readings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.history    ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.current_user_unit()
RETURNS uuid AS $$
  SELECT unit_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- units
DROP POLICY IF EXISTS "units_select_authenticated" ON public.units;
CREATE POLICY "units_select_authenticated" ON public.units
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "units_admin_all" ON public.units;
CREATE POLICY "units_admin_all" ON public.units
  FOR ALL TO authenticated USING (public.current_user_role() = 'admin');

-- profiles
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL TO authenticated USING (public.current_user_role() = 'admin');

-- zones
DROP POLICY IF EXISTS "zones_select_authenticated" ON public.zones;
CREATE POLICY "zones_select_authenticated" ON public.zones
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "zones_admin_all" ON public.zones;
CREATE POLICY "zones_admin_all" ON public.zones
  FOR ALL TO authenticated USING (public.current_user_role() = 'admin');

-- items
DROP POLICY IF EXISTS "items_select_unit" ON public.items;
CREATE POLICY "items_select_unit" ON public.items
  FOR SELECT TO authenticated USING (unit_id = public.current_user_unit());
DROP POLICY IF EXISTS "items_insert_inspector_admin" ON public.items;
CREATE POLICY "items_insert_inspector_admin" ON public.items
  FOR INSERT TO authenticated WITH CHECK (
    public.current_user_role() IN ('admin', 'inspector')
    AND unit_id = public.current_user_unit()
  );
DROP POLICY IF EXISTS "items_update_inspector_admin" ON public.items;
CREATE POLICY "items_update_inspector_admin" ON public.items
  FOR UPDATE TO authenticated USING (
    public.current_user_role() IN ('admin', 'inspector')
    AND unit_id = public.current_user_unit()
  );
DROP POLICY IF EXISTS "items_delete_admin" ON public.items;
CREATE POLICY "items_delete_admin" ON public.items
  FOR DELETE TO authenticated USING (public.current_user_role() = 'admin');

-- readings
DROP POLICY IF EXISTS "readings_select_unit" ON public.readings;
CREATE POLICY "readings_select_unit" ON public.readings
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.items WHERE items.id = readings.item_id AND items.unit_id = public.current_user_unit())
  );
DROP POLICY IF EXISTS "readings_insert_inspector_admin" ON public.readings;
CREATE POLICY "readings_insert_inspector_admin" ON public.readings
  FOR INSERT TO authenticated WITH CHECK (public.current_user_role() IN ('admin', 'inspector'));
DROP POLICY IF EXISTS "readings_delete_admin" ON public.readings;
CREATE POLICY "readings_delete_admin" ON public.readings
  FOR DELETE TO authenticated USING (public.current_user_role() = 'admin');

-- evidences
DROP POLICY IF EXISTS "evidences_select_unit" ON public.evidences;
CREATE POLICY "evidences_select_unit" ON public.evidences
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.items WHERE items.id = evidences.item_id AND items.unit_id = public.current_user_unit())
  );
DROP POLICY IF EXISTS "evidences_insert_inspector_admin" ON public.evidences;
CREATE POLICY "evidences_insert_inspector_admin" ON public.evidences
  FOR INSERT TO authenticated WITH CHECK (public.current_user_role() IN ('admin', 'inspector'));
DROP POLICY IF EXISTS "evidences_delete_admin" ON public.evidences;
CREATE POLICY "evidences_delete_admin" ON public.evidences
  FOR DELETE TO authenticated USING (public.current_user_role() = 'admin');

-- history (read-only audit; written only by trigger)
DROP POLICY IF EXISTS "history_select_unit" ON public.history;
CREATE POLICY "history_select_unit" ON public.history
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.items WHERE items.id = history.item_id AND items.unit_id = public.current_user_unit())
  );


-- =============================================================================
-- SECTION 7 — STORAGE BUCKET
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidence-photos',
  'evidence-photos',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "evidence_select_authenticated" ON storage.objects;
CREATE POLICY "evidence_select_authenticated" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'evidence-photos');

DROP POLICY IF EXISTS "evidence_insert_inspector_admin" ON storage.objects;
CREATE POLICY "evidence_insert_inspector_admin" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'evidence-photos' AND public.current_user_role() IN ('admin', 'inspector')
  );

DROP POLICY IF EXISTS "evidence_delete_admin" ON storage.objects;
CREATE POLICY "evidence_delete_admin" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'evidence-photos' AND public.current_user_role() = 'admin'
  );


-- =============================================================================
-- SECTION 8 — STRUCTURAL SEED (units + zones only)
-- =============================================================================

INSERT INTO public.units (code, name, type)
VALUES ('SS-75', 'Noble Courage', 'Semisubmersible')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.zones (zid, name, description, system, default_freq, drops_zone, display_order) VALUES
  ('Z01', 'Crown Level',                          'Top of the derrick / crown block area',                  'Drilling',    'Weekly',  true,  1),
  ('Z02', 'Crown to Monkey Board',                'Derrick structure from crown to monkey board',           'Drilling',    'Weekly',  true,  2),
  ('Z03', 'Monkey Board to Drill Floor',          'Derrick structure from monkey board to drill floor',     'Drilling',    'Weekly',  true,  3),
  ('Z04', 'Travelling Equipment',                 'Top drive, blocks, hooks, travelling assembly',          'Drilling',    'Weekly',  true,  4),
  ('Z05', 'Substructure / Under Drill Floor / Moon Pool', 'Sub-structure, BOP area, moon pool',             'Drilling',    'Weekly',  true,  5),
  ('Z06', 'Machinery Spaces',                     'Engine rooms, pump rooms, mechanical compartments',       'Maintenance', 'Monthly', false, 6),
  ('Z07', 'Deck Cranes',                          'Pedestal cranes and lifting equipment (API 2C)',         'Maintenance', 'Weekly',  true,  7),
  ('Z08', 'Columns / Pontoons',                   'Underwater structural members, ballast tanks',           'Marine',      'Monthly', false, 8),
  ('Z09', 'Shale Shakers',                        'Solids control equipment and shaker house',              'Drilling',    'Monthly', false, 9),
  ('Z10', 'Helideck / Radio Room Roof',           'Helideck structure and elevated surfaces (CAP 437)',     'Safety',      'Monthly', false, 10),
  ('Z11', 'Accommodation Area',                   'Living quarters, common areas, galley',                  'Safety',      'Monthly', false, 11),
  ('Z12', 'Lifeboats / Muster Areas',             'Lifeboats, davits, muster stations (LSA Code)',          'Safety',      'Monthly', false, 12),
  ('Z13', 'Main Deck',                            'Main deck plating, walkways, pipe racks',                'Marine',      'Weekly',  true,  13),
  ('Z14', 'ROV Area',                             'ROV launch and recovery, subsea equipment area',         'Third Party', 'Monthly', false, 14)
ON CONFLICT (zid) DO NOTHING;


-- =============================================================================
-- SECTION 9 — VERIFICATION QUERY
-- =============================================================================
-- Expected: 1 unit, 14 zones, 0 in all other tables.

SELECT 'units' AS table_name, count(*)::text AS rows FROM public.units
UNION ALL SELECT 'zones',     count(*)::text FROM public.zones
UNION ALL SELECT 'profiles',  count(*)::text FROM public.profiles
UNION ALL SELECT 'items',     count(*)::text FROM public.items
UNION ALL SELECT 'readings',  count(*)::text FROM public.readings
UNION ALL SELECT 'evidences', count(*)::text FROM public.evidences
UNION ALL SELECT 'history',   count(*)::text FROM public.history;

-- =============================================================================
-- SETUP COMPLETE
-- =============================================================================
-- If the schema was provisioned from an earlier version of this file (without
-- SECURITY DEFINER on audit_item_changes), apply only the fix:
--
--   ALTER FUNCTION public.audit_item_changes() SECURITY DEFINER;
--   ALTER FUNCTION public.audit_item_changes() SET search_path = public;
--
-- If Z14's department was seeded as 'Subsea', rename it to 'Third Party':
--
--   UPDATE public.zones SET system = 'Third Party' WHERE zid = 'Z14';
-- =============================================================================
