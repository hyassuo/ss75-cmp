-- =============================================================================
-- SS-75 CMP — ROLLBACK of supabase-schema-v140.sql (run once in SQL Editor)
-- =============================================================================
-- Idempotent. Returns the database to the exact pre-v140 state:
--   1) drops the subarea integrity trigger + function
--   2) drops the nine v140 columns from public.items
--   3) drops the public.subareas table (and its policies/trigger with it)
--   4) restores the v1.3.0 body of audit_item_changes()
--
-- WARNING: dropping the columns/table DELETES any data stored in them
-- (sub-áreas, tratativas, faixas, acessório). Take a snapshot first
-- (supabase-backup-snapshot.sql) if that data matters.
-- =============================================================================

-- 1) Subarea integrity trigger ------------------------------------------------
DROP TRIGGER IF EXISTS trg_items_validate_subarea ON public.items;
DROP FUNCTION IF EXISTS public.validate_item_subarea();

-- 2) v140 columns on items ----------------------------------------------------
ALTER TABLE public.items DROP COLUMN IF EXISTS subarea_id;
ALTER TABLE public.items DROP COLUMN IF EXISTS action_type;
ALTER TABLE public.items DROP COLUMN IF EXISTS action_due;
ALTER TABLE public.items DROP COLUMN IF EXISTS action_status;
ALTER TABLE public.items DROP COLUMN IF EXISTS action_note;
ALTER TABLE public.items DROP COLUMN IF EXISTS corr_extent_band;
ALTER TABLE public.items DROP COLUMN IF EXISTS material_loss_band;
ALTER TABLE public.items DROP COLUMN IF EXISTS is_accessory;
ALTER TABLE public.items DROP COLUMN IF EXISTS accessory_type;

-- 3) Subareas catalog ---------------------------------------------------------
DROP TRIGGER IF EXISTS trg_subareas_author ON public.subareas;
DROP TABLE IF EXISTS public.subareas;

-- 4) Restore the v1.3.0 audit trigger body -----------------------------------
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
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- 1) SELECT count(*) FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='items'
--       AND column_name IN ('subarea_id','action_type','action_due',
--         'action_status','action_note','corr_extent_band',
--         'material_loss_band','is_accessory','accessory_type');
--    -- must return 0
-- 2) SELECT to_regclass('public.subareas');  -- must return NULL
-- =============================================================================
