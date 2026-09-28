-- =============================================================================
-- SS-75 CMP — SCHEMA v1.3.0: drops_risk, structural, obs_source on items
-- =============================================================================
-- Run once in Supabase SQL Editor. Idempotent — safe to re-run.
-- =============================================================================

-- 1) DROPS risk flag — contributes to priority weight (handoff: priority
--    uses it like SECE but with a smaller bump).
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS drops_risk boolean NOT NULL DEFAULT false;

-- 2) Structural-element flag — same idea: weighs into priority.
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS structural boolean NOT NULL DEFAULT false;

-- 3) Observation source — where the finding came from (free-text enum-ish,
--    not constrained at the DB so it stays editable from the dashboard).
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS obs_source text;

-- 4) Audit-trigger: log changes to the new columns too so the History
--    panel shows them.
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
-- Confirm new columns exist:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='items'
--      AND column_name IN ('drops_risk','structural','obs_source');
-- =============================================================================
