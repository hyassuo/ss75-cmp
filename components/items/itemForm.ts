import { calcNextInspection } from "@/lib/domain/calcNextInspection";
import { calcPriority, effectivePriority } from "@/lib/domain/calcPriority";
import { today } from "@/lib/utils/format";
import type {
  AccessoryType,
  ActionStatus,
  ActionType,
  CorrExtentBand,
  InspectionFrequency,
  Item,
  ItemPriority,
  ItemStatus,
  ItemWithRelations,
  MaterialLossBand,
} from "@/lib/types/domain";

// Pure form logic of the item modal: item/form mapping both ways, the diff that is
// actually saved, and the rebase used for drafts and conflicts. Kept free
// of React so it can be unit-tested (tests/itemForm.test.ts): this is the
// code that decides what gets written over whose changes.

export type SetField = <K extends keyof Form>(k: K, v: Form[K]) => void;

export type Form = {
  name: string;
  zone_id: string;
  mechanism: string;
  protection: string;
  ifs_obj_id: string;
  ifs_obj_desc: string;
  ifs_wo: string;
  ifs_fl: string;
  prob: number | null;
  cons: number | null;
  priority: ItemPriority | null;
  status: ItemStatus;
  sece: boolean;
  drops_risk: boolean;
  structural: boolean;
  obs_source: string;
  freq_insp: InspectionFrequency | null;
  last_insp: string | null;
  next_insp: string | null;
  resolved_at: string | null;
  subarea_id: string;
  action_type: ActionType | "";
  action_due: string | null;
  action_status: ActionStatus | "";
  action_note: string;
  corr_extent_band: CorrExtentBand | "";
  material_loss_band: MaterialLossBand | "";
  is_accessory: boolean;
  accessory_type: AccessoryType | "";
  notes: string;
};

export function formFromItem(item: ItemWithRelations, isNew: boolean): Form {
  return {
    // On a freshly created draft the DB row carries the "Untitled" fallback;
    // surface it as an empty field so the user types their own name instead
    // of having to manually erase the placeholder text.
    name:
      item.name && item.name !== "Untitled" && item.name !== "Sem nome"
        ? item.name
        : "",
    zone_id: item.zone_id,
    mechanism: item.mechanism ?? "",
    protection: item.protection ?? "",
    ifs_obj_id: item.ifs_obj_id ?? "",
    ifs_obj_desc: item.ifs_obj_desc ?? "",
    ifs_wo: item.ifs_wo ?? "",
    ifs_fl: item.ifs_fl ?? "",
    prob: item.prob ?? null,
    cons: item.cons ?? null,
    // Today's priority (overdue escalation included), not the stored
    // snapshot: the modal must agree with the cards and the matrix.
    priority: effectivePriority(item),
    status: item.status ?? "Pending",
    sece: item.sece ?? false,
    drops_risk: item.drops_risk ?? false,
    structural: item.structural ?? false,
    obs_source: item.obs_source ?? "",
    freq_insp: item.freq_insp ?? null,
    // New items default the last-inspection date to today (the registration
    // date), which is the most common case for a freshly catalogued item.
    // The user can still change it. Existing items keep whatever's stored.
    last_insp: item.last_insp ?? (isNew ? today() : null),
    next_insp: item.next_insp ?? null,
    resolved_at: item.resolved_at ?? null,
    subarea_id: item.subarea_id ?? "",
    action_type: item.action_type ?? "",
    action_due: item.action_due ?? null,
    action_status: item.action_status ?? "",
    action_note: item.action_note ?? "",
    corr_extent_band: item.corr_extent_band ?? "",
    material_loss_band: item.material_loss_band ?? "",
    is_accessory: item.is_accessory ?? false,
    accessory_type: item.accessory_type ?? "",
    notes: item.notes ?? "",
  };
}

// Form → the item columns it persists.
export function patchFromForm(f: Form, name: string): Partial<Item> {
  return {
    name,
    zone_id: f.zone_id,
    subarea_id: f.subarea_id || null,
    action_type: f.action_type || null,
    action_due: f.action_due,
    action_status: f.action_type ? f.action_status || "Sem planejamento" : null,
    action_note: f.action_note || null,
    corr_extent_band: f.corr_extent_band || null,
    material_loss_band: f.material_loss_band || null,
    is_accessory: f.is_accessory,
    accessory_type: f.is_accessory ? f.accessory_type || null : null,
    mechanism: f.mechanism || null,
    protection: f.protection || null,
    ifs_obj_id: f.ifs_obj_id || null,
    ifs_obj_desc: f.ifs_obj_desc || null,
    ifs_wo: f.ifs_wo || null,
    ifs_fl: f.ifs_fl || null,
    prob: f.prob,
    cons: f.cons,
    priority: f.priority,
    status: f.status,
    sece: f.sece,
    drops_risk: f.drops_risk,
    structural: f.structural,
    obs_source: f.obs_source || null,
    freq_insp: f.freq_insp,
    last_insp: f.last_insp,
    next_insp: f.next_insp,
    resolved_at: f.resolved_at,
    notes: f.notes || null,
  };
}

// Only the columns whose value differs from `base` (the row as it was when
// editing started). Saving a diff instead of the whole form means a save
// never reverts fields someone else changed meanwhile.
export function diffPatch(full: Partial<Item>, base: Item): Partial<Item> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(full)) {
    const cur = (base as unknown as Record<string, unknown>)[k];
    if ((v ?? null) !== (cur ?? null)) out[k] = v;
  }
  return out as Partial<Item>;
}

export const sameForm = (a: Form, b: Form) => JSON.stringify(a) === JSON.stringify(b);

// Re-apply the user's edits (the fields where `edited` differs from
// `editedFrom`) on top of the item's current version, then recompute the
// derived fields (next inspection, priority) from the merged values. Used
// when restoring a local draft and when saving over a conflict, so fields
// the user never touched keep the other person's newer values.
export function rebase(
  current: ItemWithRelations,
  edited: Form,
  editedFrom: Form
): Form {
  const next = formFromItem(current, false);
  const out = next as unknown as Record<string, unknown>;
  const src = edited as unknown as Record<string, unknown>;
  const from = editedFrom as unknown as Record<string, unknown>;
  const changed = new Set<string>();
  for (const k of Object.keys(src)) {
    if (k === "next_insp" || k === "priority") continue;
    if (JSON.stringify(src[k]) !== JSON.stringify(from[k])) {
      out[k] = src[k];
      changed.add(k);
    }
  }
  // Derived fields are recomputed only when the user changed one of their
  // inputs; otherwise the current stored values stand.
  if (changed.has("last_insp") || changed.has("freq_insp")) {
    next.next_insp = calcNextInspection(next.last_insp, next.freq_insp);
  }
  if (
    ["prob", "cons", "sece", "drops_risk", "structural", "last_insp", "freq_insp"]
      .some((k) => changed.has(k))
  ) {
    next.priority = calcPriority(
      next.prob,
      next.cons,
      next.sece,
      next.next_insp,
      next.drops_risk,
      next.structural
    );
  }
  return next;
}
