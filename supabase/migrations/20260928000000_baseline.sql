-- =============================================================================
-- SS-75 CORROSION MANAGEMENT PLAN — SUPABASE SETUP
-- =============================================================================
-- Project:    ss75-cmp
-- Author:     Helcio Yassuo
-- Database:   PostgreSQL 15+ (Supabase managed)
-- Tables:     8 (units, profiles, zones, subareas, items, readings, evidences, history)
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

-- subareas: managed compartments inside a DROPS zone (v1.4.0). Admin-curated
-- so names stay consistent (free text degrades: "SALA DE BOMBA/BOMBAS").
CREATE TABLE IF NOT EXISTS public.subareas (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id       uuid NOT NULL REFERENCES public.units(id),
  zone_id       text NOT NULL REFERENCES public.zones(zid),
  name          text NOT NULL,
  display_order int,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (unit_id, zone_id, name)
);
CREATE INDEX IF NOT EXISTS idx_subareas_unit_zone ON public.subareas(unit_id, zone_id);

-- items: corrosion inspection points (core entity)
CREATE TABLE IF NOT EXISTS public.items (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id         uuid NOT NULL REFERENCES public.units(id),
  zone_id         text NOT NULL REFERENCES public.zones(zid),
  -- ON DELETE SET NULL: removing a catalog entry never orphans items.
  subarea_id      uuid REFERENCES public.subareas(id) ON DELETE SET NULL,
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
  drops_risk      boolean NOT NULL DEFAULT false,
  structural      boolean NOT NULL DEFAULT false,
  obs_source      text,
  freq_insp       inspection_frequency,
  last_insp       date,
  next_insp       date,
  resolved_at     date,
  archived        boolean DEFAULT false,
  -- Tratativa (corrective-action cycle, v1.4.0). Canonical values are
  -- Portuguese (FM-116-OFF reference method); UI dict provides EN labels.
  action_type     text,
  action_due      date,
  action_status   text,
  action_note     text,
  -- Informative assessment bands (v1.4.0) — do NOT affect priority.
  corr_extent_band   text,
  material_loss_band text,
  -- Line accessory (v1.4.0): IFS object = parent LINE; item = accessory on it.
  is_accessory    boolean NOT NULL DEFAULT false,
  accessory_type  text,
  notes           text,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
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
CREATE INDEX IF NOT EXISTS idx_items_subarea ON public.items(subarea_id);
CREATE INDEX IF NOT EXISTS idx_items_action_due
  ON public.items(action_due) WHERE action_due IS NOT NULL;

-- readings: pit depth measurements
CREATE TABLE IF NOT EXISTS public.readings (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id      uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  reading_date date NOT NULL,
  depth_mm     numeric(6,3) NOT NULL CONSTRAINT readings_depth_nonneg CHECK (depth_mm >= 0),
  location     text,
  checked_by   text,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
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
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now(),
  -- The photo must live in this evidence's own item folder (v1.15).
  CONSTRAINT evidences_file_in_item_folder
    CHECK (file_path IS NULL OR file_path LIKE item_id::text || '/%')
);
CREATE INDEX IF NOT EXISTS idx_evidences_item ON public.evidences(item_id);

-- history: granular, append-only audit log. It must outlive the items it
-- describes (hardening round 5): item_id is SET NULL when the item is
-- deleted, while item_ref / item_name / unit_id keep a snapshot of the item's
-- identity so the rows stay attributable and visible to their unit.
CREATE TABLE IF NOT EXISTS public.history (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id       uuid REFERENCES public.items(id) ON DELETE SET NULL,
  item_ref      uuid,
  item_name     text,
  -- No ON DELETE action: a unit that still has audit history can't be deleted.
  unit_id       uuid REFERENCES public.units(id),
  event_date    timestamptz DEFAULT now(),
  action        text NOT NULL,
  field_changed text,
  prev_value    text,
  new_value     text,
  note          text,
  -- SET NULL: by_user_email keeps the attribution after a user is deleted.
  by_user       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  by_user_email text
);
-- Upgrade path for pre-round-5 databases (no-ops on a fresh install).
ALTER TABLE public.history ADD COLUMN IF NOT EXISTS item_ref  uuid;
ALTER TABLE public.history ADD COLUMN IF NOT EXISTS item_name text;
ALTER TABLE public.history ADD COLUMN IF NOT EXISTS unit_id   uuid REFERENCES public.units(id);
UPDATE public.history h
SET item_ref  = COALESCE(h.item_ref, h.item_id),
    item_name = COALESCE(h.item_name, i.name),
    unit_id   = COALESCE(h.unit_id, i.unit_id)
FROM public.items i
WHERE i.id = h.item_id
  AND (h.item_ref IS NULL OR h.item_name IS NULL OR h.unit_id IS NULL);
ALTER TABLE public.history ALTER COLUMN item_id DROP NOT NULL;
ALTER TABLE public.history DROP CONSTRAINT IF EXISTS history_item_id_fkey;
ALTER TABLE public.history
  ADD CONSTRAINT history_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE SET NULL;
ALTER TABLE public.history DROP CONSTRAINT IF EXISTS history_by_user_fkey;
ALTER TABLE public.history
  ADD CONSTRAINT history_by_user_fkey
  FOREIGN KEY (by_user) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Authorship FKs SET NULL (hardening round 5) on pre-existing databases,
-- so a user who authored rows can still be deleted.
DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      ('items',     'created_by'),
      ('items',     'updated_by'),
      ('readings',  'created_by'),
      ('evidences', 'created_by'),
      ('subareas',  'created_by')
    ) AS t(tbl, col)
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
                   fk.tbl, fk.tbl || '_' || fk.col || '_fkey');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) '
      'REFERENCES public.profiles(id) ON DELETE SET NULL',
      fk.tbl, fk.tbl || '_' || fk.col || '_fkey', fk.col);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_history_item ON public.history(item_id);
CREATE INDEX IF NOT EXISTS idx_history_date ON public.history(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_history_unit ON public.history(unit_id);
CREATE INDEX IF NOT EXISTS idx_history_item_ref ON public.history(item_ref);


-- =============================================================================
-- SECTION 4 — TRIGGERS: updated_at + audit log
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  -- An authorship-only change (created_by/updated_by nulled because a user
  -- was deleted) is not an edit: keep updated_at, or every open editor of
  -- those items would hit a spurious optimistic-lock conflict.
  IF TG_TABLE_NAME = 'items'
     AND (to_jsonb(NEW) - 'created_by' - 'updated_by' - 'updated_at')
       = (to_jsonb(OLD) - 'created_by' - 'updated_by' - 'updated_at')
  THEN
    RETURN NEW;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

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
    IF OLD.drops_risk IS DISTINCT FROM NEW.drops_risk THEN
      INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
      VALUES (NEW.id, 'drops_risk_changed', 'drops_risk', OLD.drops_risk::text, NEW.drops_risk::text, NEW.updated_by, user_email);
    END IF;
    IF OLD.structural IS DISTINCT FROM NEW.structural THEN
      INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
      VALUES (NEW.id, 'structural_changed', 'structural', OLD.structural::text, NEW.structural::text, NEW.updated_by, user_email);
    END IF;
    IF OLD.obs_source IS DISTINCT FROM NEW.obs_source THEN
      INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
      VALUES (NEW.id, 'obs_source_changed', 'obs_source', OLD.obs_source, NEW.obs_source, NEW.updated_by, user_email);
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
    -- v1.4.0 fields (action_note deliberately NOT audited — same precedent
    -- as `notes`: free-text churn would flood the History panel).
    IF OLD.subarea_id IS DISTINCT FROM NEW.subarea_id THEN
      INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
      VALUES (NEW.id, 'subarea_changed', 'subarea_id',
              COALESCE((SELECT name FROM public.subareas WHERE id = OLD.subarea_id), OLD.subarea_id::text),
              COALESCE((SELECT name FROM public.subareas WHERE id = NEW.subarea_id), NEW.subarea_id::text),
              NEW.updated_by, user_email);
    END IF;
    IF OLD.action_type IS DISTINCT FROM NEW.action_type THEN
      INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
      VALUES (NEW.id, 'action_type_changed', 'action_type', OLD.action_type, NEW.action_type, NEW.updated_by, user_email);
    END IF;
    IF OLD.action_due IS DISTINCT FROM NEW.action_due THEN
      INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
      VALUES (NEW.id, 'action_due_changed', 'action_due', OLD.action_due::text, NEW.action_due::text, NEW.updated_by, user_email);
    END IF;
    IF OLD.action_status IS DISTINCT FROM NEW.action_status THEN
      INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
      VALUES (NEW.id, 'action_status_changed', 'action_status', OLD.action_status, NEW.action_status, NEW.updated_by, user_email);
    END IF;
    IF OLD.corr_extent_band IS DISTINCT FROM NEW.corr_extent_band THEN
      INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
      VALUES (NEW.id, 'corr_extent_changed', 'corr_extent_band', OLD.corr_extent_band, NEW.corr_extent_band, NEW.updated_by, user_email);
    END IF;
    IF OLD.material_loss_band IS DISTINCT FROM NEW.material_loss_band THEN
      INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
      VALUES (NEW.id, 'material_loss_changed', 'material_loss_band', OLD.material_loss_band, NEW.material_loss_band, NEW.updated_by, user_email);
    END IF;
    IF OLD.is_accessory IS DISTINCT FROM NEW.is_accessory THEN
      INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
      VALUES (NEW.id, 'accessory_changed', 'is_accessory', OLD.is_accessory::text, NEW.is_accessory::text, NEW.updated_by, user_email);
    END IF;
    IF OLD.accessory_type IS DISTINCT FROM NEW.accessory_type THEN
      INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
      VALUES (NEW.id, 'accessory_type_changed', 'accessory_type', OLD.accessory_type, NEW.accessory_type, NEW.updated_by, user_email);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Subarea integrity guard (v1.4.0): the FK alone would accept another
-- unit's/zone's subarea via a crafted direct PostgREST call.
CREATE OR REPLACE FUNCTION public.validate_item_subarea()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.subarea_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.subareas s
      WHERE s.id = NEW.subarea_id
        AND s.unit_id = NEW.unit_id
        AND s.zone_id = NEW.zone_id
    ) THEN
      RAISE EXCEPTION 'subarea % does not belong to the item''s unit/zone',
        NEW.subarea_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_items_validate_subarea ON public.items;
CREATE TRIGGER trg_items_validate_subarea
  BEFORE INSERT OR UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.validate_item_subarea();

DROP TRIGGER IF EXISTS trg_audit_items ON public.items;
CREATE TRIGGER trg_audit_items
  AFTER INSERT OR UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.audit_item_changes();

-- Pristine drafts (hardening round 5) — the only items a non-admin may
-- delete; see items_delete_creator.
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
  -- Readings/evidences don't count (above), so neither do their audit
  -- events: adding (or adding then removing) a photo keeps it a draft.
  AND NOT EXISTS (
    SELECT 1 FROM public.history h
    WHERE h.item_id = p_item
      AND h.action NOT IN ('created', 'reading_added', 'reading_deleted',
                           'evidence_added', 'evidence_deleted')
  )
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;
-- INVOKER: called from the RLS policy it runs as the querying user, so the
-- items/history RLS limits it to the user's unit — exposed as
-- /rpc/is_pristine_draft it can't probe other units' rows. Triggers call it
-- from SECURITY DEFINER code and see everything.
REVOKE EXECUTE ON FUNCTION public.is_pristine_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_pristine_draft(uuid) TO authenticated, service_role;


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
-- cover. Kept in a separate trigger so re-running supabase/upgrades/schema-v130.sql /
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
  IF OLD.ifs_obj_desc IS DISTINCT FROM NEW.ifs_obj_desc THEN
    INSERT INTO public.history (item_id, action, field_changed, prev_value, new_value, by_user, by_user_email)
    VALUES (NEW.id, 'ifs_desc_changed', 'ifs_obj_desc', OLD.ifs_obj_desc, NEW.ifs_obj_desc, NEW.updated_by, user_email);
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

-- Record every item deletion (hardening round 5). Runs BEFORE DELETE so the row (and its
-- readings/evidences) still exist to be counted and referenced.
CREATE OR REPLACE FUNCTION public.audit_item_delete()
RETURNS TRIGGER AS $$
DECLARE
  uid        uuid := auth.uid();
  user_email text;
  n_readings int;
  n_evidences int;
  pristine   boolean := public.is_pristine_draft(OLD.id);
BEGIN
  -- Belt and braces for items_delete_creator: its policy check can race a
  -- concurrent UPDATE (it sees the pre-update row). Here the row is final.
  IF uid IS NOT NULL
     AND public.current_user_role() IS DISTINCT FROM 'admin'
     AND NOT pristine
  THEN
    RAISE EXCEPTION 'only an administrator can delete item %', OLD.id
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO n_readings  FROM public.readings  WHERE item_id = OLD.id;
  SELECT count(*) INTO n_evidences FROM public.evidences WHERE item_id = OLD.id;

  -- A cancelled "New Item" that never held anything: drop its 'created'
  -- event instead of logging noise.
  IF n_readings = 0 AND n_evidences = 0 AND pristine THEN
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

-- Deleting a reading or an evidence is audited (hardening round 5); the
-- abandoned-draft sweep runs server-side.
CREATE OR REPLACE FUNCTION public.audit_child_delete()
RETURNS TRIGGER AS $$
DECLARE
  uid        uuid := auth.uid();
  user_email text;
BEGIN
  -- Rows removed by an item deletion's cascade: the parent is already gone
  -- and its 'deleted' event carries the counts.
  IF NOT EXISTS (SELECT 1 FROM public.items WHERE id = OLD.item_id) THEN
    RETURN OLD;
  END IF;
  SELECT email INTO user_email FROM public.profiles WHERE id = uid;
  IF TG_TABLE_NAME = 'readings' THEN
    INSERT INTO public.history
      (item_id, action, field_changed, prev_value, by_user, by_user_email, note)
    VALUES
      (OLD.item_id, 'reading_deleted', 'depth_mm', OLD.depth_mm::text, uid, user_email,
       format('Reading removed: %s mm on %s%s', OLD.depth_mm, OLD.reading_date,
              COALESCE(' at ' || OLD.location, '')));
  ELSE
    INSERT INTO public.history
      (item_id, action, field_changed, prev_value, by_user, by_user_email, note)
    VALUES
      (OLD.item_id, 'evidence_deleted', 'file_path', OLD.file_path, uid, user_email,
       format('Evidence removed: %s — %s', OLD.evidence_date,
              COALESCE(OLD.description, '')));
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_audit_readings_delete ON public.readings;
CREATE TRIGGER trg_audit_readings_delete
  AFTER DELETE ON public.readings
  FOR EACH ROW EXECUTE FUNCTION public.audit_child_delete();
DROP TRIGGER IF EXISTS trg_audit_evidences_delete ON public.evidences;
CREATE TRIGGER trg_audit_evidences_delete
  AFTER DELETE ON public.evidences
  FOR EACH ROW EXECUTE FUNCTION public.audit_child_delete();

-- The caller's own "New Item" stubs abandoned for 24+ hours (tab closed,
-- idle logout). The server decides what is a draft; the client only hides
-- the ids this returns. INVOKER: runs under the caller's RLS.
CREATE OR REPLACE FUNCTION public.discard_my_abandoned_drafts()
RETURNS SETOF uuid AS $$
DECLARE
  d uuid;
BEGIN
  -- Row-locked one by one, and re-checked after the lock, so a draft that
  -- is being saved right now (concurrent UPDATE) is skipped, never swept.
  -- 24 h — well past the 30 min idle sign-out, so an inspector who gets
  -- logged out can still come back to the stub (and its local draft).
  FOR d IN
    SELECT i.id FROM public.items i
     WHERE i.created_by = auth.uid()
       AND i.created_at < now() - interval '24 hours'
     FOR UPDATE SKIP LOCKED
  LOOP
    IF public.is_pristine_draft(d)
       AND NOT EXISTS (SELECT 1 FROM public.readings r WHERE r.item_id = d)
       AND NOT EXISTS (SELECT 1 FROM public.evidences e WHERE e.item_id = d)
    THEN
      DELETE FROM public.items WHERE id = d;
      IF FOUND THEN RETURN NEXT d; END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.discard_my_abandoned_drafts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discard_my_abandoned_drafts() TO authenticated;

-- Server-enforced authorship: created_by/updated_by always reflect the JWT,
-- never a client-supplied value (service-role writes pass through unchanged).
-- created_at (and items.updated_at) are server-set on INSERT, and
-- created_by/created_at/unit_id are frozen on UPDATE (hardening round 5):
-- otherwise an inspector could claim any item, or forge its age.
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
        -- Server-chosen id: the evidence-photos folder is keyed by item id,
        -- so a client-chosen id could re-occupy another unit's old folder.
        NEW.id := gen_random_uuid();
        NEW.updated_at := now();
      ELSE
        -- Frozen — except when the author's profile is being deleted
        -- (ON DELETE SET NULL cascade), which must be allowed through.
        IF NEW.created_by IS NOT NULL
           OR EXISTS (SELECT 1 FROM public.profiles WHERE id = OLD.created_by)
        THEN
          NEW.created_by := OLD.created_by;
        END IF;
        NEW.created_at := OLD.created_at;
        NEW.unit_id    := OLD.unit_id;
      END IF;
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

DROP TRIGGER IF EXISTS trg_subareas_author ON public.subareas;
CREATE TRIGGER trg_subareas_author
  BEFORE INSERT ON public.subareas
  FOR EACH ROW EXECUTE FUNCTION public.enforce_author();


-- =============================================================================
-- SECTION 5 — AUTH HOOK: auto-create profile on signup
-- =============================================================================

-- NOTE: 'hyassuo@gmail.com' is the bootstrap admin (auto-active on first
-- sign-in so the very first login works). After the first admin exists,
-- this special case can be removed by re-running this function definition
-- without the email checks.
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

  -- New profiles are INACTIVE by default. The admin "Create User" API route
  -- activates the ones it creates. This neutralises rogue public sign-ups:
  -- even if signups are enabled, a self-registered account can read nothing
  -- (RLS helpers + guards reject inactive users) until an admin activates it.
  -- The bootstrap admin is the exception so the very first login works.
  INSERT INTO public.profiles (id, email, full_name, role, unit_id, active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    assigned_role,
    default_unit_id,
    (NEW.email = 'hyassuo@gmail.com')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
ALTER TABLE public.subareas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.readings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.history    ENABLE ROW LEVEL SECURITY;

-- Helpers return NULL for deactivated profiles so a deactivated user loses
-- all RLS-mediated access immediately (not only at JWT expiry).
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND active = true
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.current_user_unit()
RETURNS uuid AS $$
  SELECT unit_id FROM public.profiles WHERE id = auth.uid() AND active = true
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- units
DROP POLICY IF EXISTS "units_select_authenticated" ON public.units;
-- Active users only (inactive accounts read nothing; see 20260929000100).
CREATE POLICY "units_select_authenticated" ON public.units
  FOR SELECT TO authenticated USING (public.current_user_role() IS NOT NULL);
-- Admins may touch only their own unit row (hardening round 4): a global
-- admin policy would let any admin rename/delete other units via direct
-- PostgREST, and a unit delete cascades to that unit's data.
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

-- profiles
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
-- Visibility limited to self OR admins. Avoids leaking emails/names of other
-- users to viewers/inspectors via direct PostgREST calls.
-- Admin visibility/management scoped to the admin's own unit (hardening
-- round 4) — a global admin branch let any admin reach every unit's
-- profiles via direct PostgREST.
DROP POLICY IF EXISTS "profiles_select_self_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_self_or_admin" ON public.profiles
  FOR SELECT TO authenticated USING (
    id = auth.uid()
    OR (
      public.current_user_role() = 'admin'
      AND unit_id = public.current_user_unit()
    )
  );
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());
-- No admin write policy (hardening round 5): a FOR ALL admin policy let an
-- admin INSERT/DELETE profiles via direct PostgREST, bypassing the "last
-- admin" / "no self-delete" guards of the /api/users routes. Admin
-- visibility comes from profiles_select_self_or_admin above.
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;

-- Column-level guard: without this, profiles_update_self would let any user
-- set their own role/active (privilege escalation). role/active/unit_id —
-- and creating/deleting profiles — are managed only via the admin API
-- routes (service role).
REVOKE UPDATE ON public.profiles FROM authenticated, anon;
REVOKE INSERT, DELETE, TRUNCATE ON public.profiles FROM authenticated, anon;
GRANT UPDATE (full_name, dept) ON public.profiles TO authenticated;

-- zones
DROP POLICY IF EXISTS "zones_select_authenticated" ON public.zones;
-- Active users only (inactive accounts read nothing; see 20260929000100).
CREATE POLICY "zones_select_authenticated" ON public.zones
  FOR SELECT TO authenticated USING (public.current_user_role() IS NOT NULL);
-- The zone catalog (Z01..Z14) is SHARED, read-only reference data
-- (hardening round 4). Dropping the admin policy leaves only zones_select,
-- so RLS denies INSERT/UPDATE/DELETE to all authenticated users. Manage
-- zones via the service role / SQL editor.
DROP POLICY IF EXISTS "zones_admin_all" ON public.zones;

-- subareas: everyone in the unit reads; only the unit's admins write.
DROP POLICY IF EXISTS "subareas_select_unit" ON public.subareas;
CREATE POLICY "subareas_select_unit" ON public.subareas
  FOR SELECT TO authenticated USING (unit_id = public.current_user_unit());
DROP POLICY IF EXISTS "subareas_admin_all" ON public.subareas;
CREATE POLICY "subareas_admin_all" ON public.subareas
  FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'admin'
    AND unit_id = public.current_user_unit()
  )
  WITH CHECK (
    public.current_user_role() = 'admin'
    AND unit_id = public.current_user_unit()
  );

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
-- USING filters which existing rows can be touched; WITH CHECK validates the
-- post-update row so an inspector cannot change unit_id and move the item
-- into another unit (silent transfer / data loss).
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
DROP POLICY IF EXISTS "items_delete_admin" ON public.items;
CREATE POLICY "items_delete_admin" ON public.items
  FOR DELETE TO authenticated USING (
    public.current_user_role() = 'admin'
    AND unit_id = public.current_user_unit()
  );
-- Creators may delete only their own pristine drafts (discarding a
-- cancelled "New Item"); deleting a real item is admin-only.
DROP POLICY IF EXISTS "items_delete_creator" ON public.items;
CREATE POLICY "items_delete_creator" ON public.items
  FOR DELETE TO authenticated USING (
    created_by = auth.uid()
    AND public.current_user_role() IN ('admin', 'inspector')
    AND unit_id = public.current_user_unit()
    AND public.is_pristine_draft(id)
  );

-- readings
DROP POLICY IF EXISTS "readings_select_unit" ON public.readings;
CREATE POLICY "readings_select_unit" ON public.readings
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.items WHERE items.id = readings.item_id AND items.unit_id = public.current_user_unit())
  );
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

-- evidences
DROP POLICY IF EXISTS "evidences_select_unit" ON public.evidences;
CREATE POLICY "evidences_select_unit" ON public.evidences
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.items WHERE items.id = evidences.item_id AND items.unit_id = public.current_user_unit())
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

-- history (read-only audit; written only by triggers). Scoped by the unit
-- snapshot so events of deleted items stay visible to their unit.
DROP POLICY IF EXISTS "history_select_unit" ON public.history;
CREATE POLICY "history_select_unit" ON public.history
  FOR SELECT TO authenticated USING (
    unit_id = public.current_user_unit()
    OR EXISTS (SELECT 1 FROM public.items WHERE items.id = history.item_id AND items.unit_id = public.current_user_unit())
  );
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.history FROM authenticated, anon;
-- TRUNCATE bypasses RLS and row triggers; PostgREST can't issue it, but
-- no API role needs it (hardening round 5).
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;


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

-- Photos are stored under {item_id}/... — readable only if the item belongs
-- to the user's unit. storage.objects' `name` MUST be qualified inside the
-- items subqueries: unqualified it resolves to items.name (hardening
-- round 5 — the unqualified form denied real uploads and let an item named
-- "<id>/x" open every unit's photos).
DROP POLICY IF EXISTS "evidence_select_authenticated" ON storage.objects;
CREATE POLICY "evidence_select_authenticated" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'evidence-photos'
    AND EXISTS (
      SELECT 1 FROM public.items i
      WHERE i.id::text = (storage.foldername(objects.name))[1]
        AND i.unit_id = public.current_user_unit()
    )
  );

DROP POLICY IF EXISTS "evidence_insert_inspector_admin" ON storage.objects;
CREATE POLICY "evidence_insert_inspector_admin" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'evidence-photos'
    AND public.current_user_role() IN ('admin', 'inspector')
    AND EXISTS (
      SELECT 1 FROM public.items i
      WHERE i.id::text = (storage.foldername(objects.name))[1]
        AND i.unit_id = public.current_user_unit()
    )
  );

DROP POLICY IF EXISTS "evidence_delete_admin" ON storage.objects;
CREATE POLICY "evidence_delete_admin" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'evidence-photos'
    AND public.current_user_role() = 'admin'
    AND EXISTS (
      SELECT 1 FROM public.items i
      WHERE i.id::text = (storage.foldername(objects.name))[1]
        AND i.unit_id = public.current_user_unit()
    )
  );

-- Discarding a new item: its creator clears the photos attached to the
-- draft (while the draft row still exists — the app deletes files first).
DROP POLICY IF EXISTS "evidence_delete_draft_creator" ON storage.objects;
CREATE POLICY "evidence_delete_draft_creator" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'evidence-photos'
    AND public.current_user_role() IN ('admin', 'inspector')
    AND EXISTS (
      SELECT 1 FROM public.items i
      WHERE i.id::text = (storage.foldername(objects.name))[1]
        AND i.unit_id = public.current_user_unit()
        AND i.created_by = auth.uid()
        AND public.is_pristine_draft(i.id)
    )
  );

-- The uploader may remove their own file that no evidence row uses — the
-- cleanup after an evidence insert that failed right after its upload.
DROP POLICY IF EXISTS "evidence_delete_own_unreferenced" ON storage.objects;
CREATE POLICY "evidence_delete_own_unreferenced" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'evidence-photos'
    AND owner_id = auth.uid()::text
    AND public.current_user_role() IN ('admin', 'inspector')
    AND NOT EXISTS (
      SELECT 1 FROM public.evidences e WHERE e.file_path = objects.name
    )
  );

-- Deleting a real item: the app deletes the row first, then its files —
-- allowed to admins of the unit the audit trail says the item was in.
-- Unit that owns a *deleted* item's leftover folder, decided with a view
-- of every unit (SECURITY DEFINER): NULL while an item with that id exists
-- anywhere, or if the audit trail ties the id to more than one unit.
CREATE OR REPLACE FUNCTION public.orphan_folder_unit(p_folder text)
RETURNS uuid AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.items WHERE id::text = p_folder) THEN NULL
    ELSE (
      SELECT CASE WHEN count(DISTINCT h.unit_id) = 1
                  THEN (array_agg(h.unit_id))[1] END
        FROM public.history h
       WHERE h.item_ref::text = p_folder
         AND EXISTS (SELECT 1 FROM public.history d
                      WHERE d.item_ref = h.item_ref AND d.action = 'deleted')
    )
  END
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.orphan_folder_unit(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orphan_folder_unit(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "evidence_delete_admin_orphans" ON storage.objects;
CREATE POLICY "evidence_delete_admin_orphans" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'evidence-photos'
    AND public.current_user_role() = 'admin'
    AND public.orphan_folder_unit((storage.foldername(objects.name))[1])
        = public.current_user_unit()
  );

-- A DELETE that filters/returns rows also needs SELECT visibility, so the
-- admin must be able to see those leftover files too.
DROP POLICY IF EXISTS "evidence_select_admin_orphans" ON storage.objects;
CREATE POLICY "evidence_select_admin_orphans" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'evidence-photos'
    AND public.current_user_role() = 'admin'
    AND public.orphan_folder_unit((storage.foldername(objects.name))[1])
        = public.current_user_unit()
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
--
-- If the schema was provisioned before the security review, run
-- supabase/upgrades/security-fixes.sql (idempotent) to apply the RLS hardening.
-- =============================================================================
