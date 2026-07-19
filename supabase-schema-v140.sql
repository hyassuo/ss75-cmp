-- =============================================================================
-- SS-75 CMP — SCHEMA v1.4.0: sub-áreas, tratativas, faixas %, acessório de linha
-- =============================================================================
-- Run once in Supabase SQL Editor. Idempotent — safe to re-run.
-- Purely ADDITIVE and backward compatible with the running app: apply this
-- BEFORE deploying the app build that uses the new fields.
-- Rollback path: supabase-rollback-v140.sql (take a data snapshot first —
-- supabase-backup-snapshot.sql).
-- =============================================================================


-- =============================================================================
-- SECTION 1 — SUBAREAS CATALOG (compartments inside a DROPS zone)
-- =============================================================================
-- Managed list (admins) so names stay consistent — the free-text reference
-- spreadsheet degraded into "SALA DE BOMBA/BOMBAS", "MOONPOOL/MOON POOL".

CREATE TABLE IF NOT EXISTS public.subareas (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id       uuid NOT NULL REFERENCES public.units(id),
  zone_id       text NOT NULL REFERENCES public.zones(zid),
  name          text NOT NULL,
  display_order int,
  created_by    uuid REFERENCES public.profiles(id),
  created_at    timestamptz DEFAULT now(),
  UNIQUE (unit_id, zone_id, name)
);
CREATE INDEX IF NOT EXISTS idx_subareas_unit_zone ON public.subareas(unit_id, zone_id);

ALTER TABLE public.subareas ENABLE ROW LEVEL SECURITY;

-- Everyone in the unit reads; only the unit's admins write.
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

-- Server-enforced authorship (same helper the other tables use).
DROP TRIGGER IF EXISTS trg_subareas_author ON public.subareas;
CREATE TRIGGER trg_subareas_author
  BEFORE INSERT ON public.subareas
  FOR EACH ROW EXECUTE FUNCTION public.enforce_author();


-- =============================================================================
-- SECTION 2 — NEW COLUMNS ON ITEMS (all additive, nullable/defaulted)
-- =============================================================================
-- Canonical values for the enum-ish text columns are PORTUGUESE (they come
-- from the FM-116-OFF reference method); the UI dict provides EN labels.
-- No CHECK constraints (v130 precedent — the UI constants are the source
-- of allowed values, and the columns stay editable from the dashboard).

-- Sub-área (compartment). ON DELETE SET NULL: removing a catalog entry
-- never orphans/blocks items.
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS subarea_id uuid
  REFERENCES public.subareas(id) ON DELETE SET NULL;

-- Tratativa (corrective-action cycle): what to do, by when, how it's going.
-- action_type:   Monitorar | Tratamento mecânico e pintura |
--                Caldeiraria + tratamento e pintura | Reparo compósito |
--                Substituição | Outro
-- action_status: Sem planejamento | Planejado | Aguardando material |
--                Em execução | Executado
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS action_type   text;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS action_due    date;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS action_status text;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS action_note   text;

-- Informative assessment bands (FM-116-OFF method). Do NOT affect priority.
-- corr_extent_band:   3-10 | 10-16 | 16-33 | 33-50 | >50
-- material_loss_band: 10-16 | 16-33 | 33-50 | >50
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS corr_extent_band   text;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS material_loss_band text;

-- Line accessory: the IFS object identifies the parent LINE (piping); the
-- item is an accessory installed on it.
-- accessory_type: Suporte | Válvula | Flange | Outro
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS is_accessory boolean NOT NULL DEFAULT false;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS accessory_type text;

CREATE INDEX IF NOT EXISTS idx_items_subarea ON public.items(subarea_id);
CREATE INDEX IF NOT EXISTS idx_items_action_due
  ON public.items(action_due) WHERE action_due IS NOT NULL;


-- =============================================================================
-- SECTION 3 — INTEGRITY GUARD: subarea must match the item's unit AND zone
-- =============================================================================
-- The FK alone would accept another unit's/zone's subarea via a crafted
-- direct PostgREST call (items_update WITH CHECK doesn't cover it).

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


-- =============================================================================
-- SECTION 4 — AUDIT TRIGGER: v1.3.0 body + the new v1.4.0 fields
-- =============================================================================
-- action_note is deliberately NOT audited (same precedent as `notes` —
-- free-text churn would flood the History panel).

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
    -- v1.4.0 fields ----------------------------------------------------------
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


-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- 1) All nine columns exist (must return 9 rows):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='items'
--      AND column_name IN ('subarea_id','action_type','action_due',
--        'action_status','action_note','corr_extent_band',
--        'material_loss_band','is_accessory','accessory_type');
-- 2) SELECT to_regclass('public.subareas');           -- not NULL
-- 3) Cross-zone guard: UPDATE public.items
--      SET subarea_id = '<id of a subarea from ANOTHER zone>'
--      WHERE id = '<item id>';
--    -- must fail with "subarea ... does not belong to the item's unit/zone"
-- =============================================================================
