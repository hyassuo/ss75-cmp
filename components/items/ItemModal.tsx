"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Section } from "@/components/ui/Section";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Label } from "@/components/ui/Label";
import { YesNoToggle } from "@/components/ui/YesNoToggle";
import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";
import { EvidencePanel } from "@/components/items/EvidencePanel";
import { ReadingsPanel } from "@/components/items/ReadingsPanel";
import { HistoryPanel } from "@/components/items/HistoryPanel";
import { IfsObjectSearch } from "@/components/items/IfsObjectSearch";
import { useData, type MutationResult } from "@/lib/context/DataContext";
import { useLang } from "@/lib/context/LangContext";
import type { DictKey } from "@/lib/i18n/dict";
import { calcPriority, effectivePriority } from "@/lib/domain/calcPriority";
import { calcNextInspection } from "@/lib/domain/calcNextInspection";
import { suggestActionDue } from "@/lib/domain/actionPlan";
import { AI_READING_CHECKED_BY, AI_READING_LOCATION } from "@/lib/domain/calcRate";
import { today } from "@/lib/utils/format";
import {
  clearItemDraft,
  loadItemDraft,
  saveItemDraft,
  type ItemDraft,
} from "@/lib/utils/itemDraft";
import {
  MECHANISMS,
  PROTECTIONS,
  STATUSES,
  OBS_SOURCES,
  FREQUENCIES,
  PRIORITY_COLOR,
  ACTION_TYPES,
  ACTION_STATUSES,
  CORR_EXTENT_BANDS,
  MATERIAL_LOSS_BANDS,
  ACCESSORY_TYPES,
} from "@/lib/utils/constants";
import type {
  AccessoryType,
  ActionStatus,
  ActionType,
  AIAnalysis,
  CorrExtentBand,
  IfsObject,
  InspectionFrequency,
  Item,
  ItemPriority,
  ItemStatus,
  ItemWithRelations,
  MaterialLossBand,
} from "@/lib/types/domain";

interface Props {
  itemId: string;
  zoneName: string;
  isNew: boolean;
  onClose: () => void;
  /**
   * Receives the modal's "may I close?" check (confirm + discard a new
   * draft) so history navigation (Back) goes through it too.
   */
  registerCloseGuard?: (fn: () => Promise<boolean>) => void;
}

type Form = {
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

export function ItemModal(props: Props) {
  const { allItems } = useData();
  const live = allItems.find((i) => i.id === props.itemId);
  // If the item disappears while open (deleted elsewhere, picked up by a
  // background refresh), keep showing the user's form instead of silently
  // unmounting it — the save will report what happened.
  const last = useRef(live);
  if (live) last.current = live;
  const item = live ?? last.current;
  if (!item) return null;
  return <ItemModalInner {...props} item={item} gone={!live} />;
}

function formFromItem(item: ItemWithRelations, isNew: boolean): Form {
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
    // snapshot — the modal must agree with the cards and the matrix.
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
function patchFromForm(f: Form, name: string): Partial<Item> {
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
function diffPatch(full: Partial<Item>, base: Item): Partial<Item> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(full)) {
    const cur = (base as unknown as Record<string, unknown>)[k];
    if ((v ?? null) !== (cur ?? null)) out[k] = v;
  }
  return out as Partial<Item>;
}

const sameForm = (a: Form, b: Form) => JSON.stringify(a) === JSON.stringify(b);

// Re-apply the user's edits (the fields where `edited` differs from
// `editedFrom`) on top of the item's current version, then recompute the
// derived fields (next inspection, priority) from the merged values. Used
// when restoring a local draft and when saving over a conflict, so fields
// the user never touched keep the other person's newer values.
function rebase(
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

function ItemModalInner({
  zoneName,
  isNew,
  onClose,
  item,
  gone,
  registerCloseGuard,
}: Props & { item: ItemWithRelations; gone: boolean }) {
  const {
    profile,
    zones,
    subareasByZone,
    createSubarea,
    updateItem,
    deleteItem,
    addReading,
    deleteReading,
    addEvidence,
    deleteEvidence,
  } = useData();
  const { t } = useLang();

  // The row as it was when editing started: the baseline for the diff
  // patch and, via updated_at, for conflict detection.
  const [base, setBase] = useState<ItemWithRelations>(item);
  const [initial, setInitial] = useState<Form>(() => formFromItem(item, isNew));
  const [f, setF] = useState<Form>(initial);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  // Edits left unsaved by a previous session (dropped link, idle logout,
  // closed tab), offered back — read synchronously so the mirroring effect
  // below can't clear the stored copy before the user decides.
  const [restorable, setRestorable] = useState<ItemDraft<Form> | null>(() => {
    if (profile.role === "viewer") return null;
    const d = loadItemDraft<Form>(profile.id, item.id);
    return d && !sameForm(d.form, initial) ? d : null;
  });
  const errorRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const fid = useId(); // prefix for label/control ids below
  const [nameError, setNameError] = useState(false);
  // AI pit-depth estimate staged in the form — persisted only on Save, so
  // cancelling the modal never leaves an orphan reading in the DB.
  const [pendingAiReading, setPendingAiReading] = useState<number | null>(null);
  // True while the evidence entry form holds an unsaved photo/description.
  const [evidenceDirty, setEvidenceDirty] = useState(false);
  // Inline admin mini-form for creating a sub-área without leaving the modal.
  const [addingSubarea, setAddingSubarea] = useState(false);
  const [newSubareaName, setNewSubareaName] = useState("");
  const [savingSubarea, setSavingSubarea] = useState(false);

  const isReadOnly = profile.role === "viewer";
  const isAdmin = profile.role === "admin";
  const dirty = !sameForm(f, initial) || pendingAiReading !== null;

  // Mirror unsaved edits to local storage (debounced). While a previous
  // draft is on offer, leave it alone until the user decides — or starts
  // typing, which means they chose to start over.
  useEffect(() => {
    if (isReadOnly) return;
    const edited = !sameForm(f, initial);
    if (restorable) {
      if (!edited) return;
      setRestorable(null);
    }
    if (edited) {
      const h = setTimeout(
        () =>
          saveItemDraft<Form>(profile.id, item.id, {
            form: f,
            baseForm: initial,
            baseUpdatedAt: base.updated_at,
            savedAt: Date.now(),
          }),
        400
      );
      return () => clearTimeout(h);
    }
    clearItemDraft(profile.id, item.id);
  }, [f, initial, base.updated_at, item.id, isReadOnly, restorable, profile.id]);

  useEffect(() => {
    if (saveError || conflict) {
      errorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [saveError, conflict]);

  function restoreDraft() {
    if (!restorable) return;
    // Only the fields the user changed come back; everything else stays at
    // the current version. The version check still starts from the draft's
    // base, so if the item moved on since, Save reports a conflict first.
    const fresh = formFromItem(item, isNew);
    setInitial(fresh);
    setF(rebase(item, restorable.form, restorable.baseForm));
    setBase({ ...item, updated_at: restorable.baseUpdatedAt });
    setRestorable(null);
  }

  function discardDraft() {
    clearItemDraft(profile.id, item.id);
    setRestorable(null);
  }

  function describe(r: MutationResult<unknown>): string {
    if (r.ok) return "";
    if (r.notFound) return t("modal.deletedElsewhere");
    return t("modal.saveFailed") + " (" + r.error + ")";
  }

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setF((x) => ({ ...x, [k]: v }));
  }

  function recalcPriority(next: Partial<Form>) {
    setF((x) => {
      const merged = { ...x, ...next };
      const p = calcPriority(
        merged.prob,
        merged.cons,
        merged.sece,
        merged.next_insp,
        merged.drops_risk,
        merged.structural
      );
      return { ...merged, priority: p };
    });
  }

  function onFreqOrLast(next: Partial<Form>) {
    setF((x) => {
      const merged = { ...x, ...next };
      // No schedule without a last date and a periodic frequency — never
      // keep a stale next date that nobody can edit away.
      const ni = calcNextInspection(merged.last_insp, merged.freq_insp);
      const withNi = { ...merged, next_insp: ni };
      const p = calcPriority(
        withNi.prob,
        withNi.cons,
        withNi.sece,
        withNi.next_insp,
        withNi.drops_risk,
        withNi.structural
      );
      return { ...withNi, priority: p };
    });
  }

  // Informative bands — a plain merge today. This is the seam for a future
  // suggestRiskFromBands(corr, loss): route the patch through
  // recalcPriority instead of setF to also propose P×C.
  function onBandChange(next: Partial<Form>) {
    setF((x) => ({ ...x, ...next }));
  }

  // Picking an action type suggests a deadline from OUR priority (Critical
  // +90d … Low +1095d). Never overwrites a user-entered date.
  function onActionTypeChange(v: string) {
    setF((x) => {
      const next = { ...x, action_type: (v || "") as ActionType | "" };
      if (v && !x.action_due) {
        next.action_due = suggestActionDue(x.priority, today());
      }
      return next;
    });
  }

  // force=false (auto-apply after analysis): fill only fields the user
  // hasn't set — never clobber manual input. force=true (the explicit
  // "Apply to Item Fields" button): overwrite, that click IS user intent.
  function applyAI(r: AIAnalysis, force = false) {
    setF((x) => {
      const next = { ...x };
      const mechMap: Record<string, string> = {
        Galvanic: "Galvanic Corrosion",
        Atmospheric: "Atmospheric Corrosion",
        Pitting: "Pitting Corrosion",
        Crevice: "Crevice Corrosion",
        MIC: "MIC (Microbiologically Influenced)",
        "Erosion-Corrosion": "Erosion-Corrosion",
        Uniform: "Uniform Corrosion",
      };
      if (
        (force || !next.mechanism) &&
        r.corrosionType &&
        mechMap[r.corrosionType]
      ) {
        next.mechanism = mechMap[r.corrosionType];
      }
      // Only fill the name when the user hasn't typed one — don't overwrite
      // a manual entry (even on force). "Unknown" from the AI is ignored.
      if (
        !next.name.trim() &&
        r.componentName &&
        r.componentName.toLowerCase() !== "unknown"
      ) {
        next.name = r.componentName;
      }
      // Suggested inspection frequency — accept an exact matrix value after
      // trimming whitespace. The model occasionally adds trailing spaces or
      // returns a near-match that strict === would reject.
      const freq =
        typeof r.inspectionFrequency === "string"
          ? r.inspectionFrequency.trim()
          : "";
      if (
        (force || !next.freq_insp) &&
        FREQUENCIES.includes(freq as InspectionFrequency)
      ) {
        next.freq_insp = freq as InspectionFrequency;
        const ni = calcNextInspection(next.last_insp, next.freq_insp);
        if (ni) next.next_insp = ni;
      }
      // Set the inputs to the risk matrix and let calcPriority derive the
      // priority — the AI never chooses the priority directly. Coerce to
      // number first: Gemini's JSON mode sometimes returns numerics as
      // strings ("3") despite the integer schema, and the Select compares
      // string vs string, so we'd end up with no selection rendered.
      const prob = Number(r.probability);
      const cons = Number(r.consequence);
      if (
        (force || next.prob == null) &&
        Number.isFinite(prob) &&
        prob >= 1 &&
        prob <= 5
      ) {
        next.prob = prob;
      }
      if (
        (force || next.cons == null) &&
        Number.isFinite(cons) &&
        cons >= 1 &&
        cons <= 5
      ) {
        next.cons = cons;
      }
      const p = calcPriority(
        next.prob,
        next.cons,
        next.sece,
        next.next_insp,
        next.drops_risk,
        next.structural
      );
      next.priority = p;
      // Status maps from the AI's recommended action: urgent → Critical,
      // anything else nudging us to act → Attention. Auto-apply only
      // escalates from the untouched default (Pending) — x.status is the
      // value BEFORE this apply.
      if (force || x.status === "Pending") {
        if (r.immediateAction === "Urgent Treatment Required") {
          next.status = "Critical";
        } else if (
          r.immediateAction === "Treat Soon" ||
          r.immediateAction === "Inspect Closely"
        ) {
          next.status = "Attention";
        }
      }
      return next;
    });
    if (r.pitDepthEstMM > 0 && item.readings.length === 0) {
      setPendingAiReading(r.pitDepthEstMM);
    }
  }

  // opts.form / opts.base: save a rebased form against the item's current
  // version (used by "save mine on top" after a conflict).
  async function save(
    opts: { form?: Form; base?: ItemWithRelations; initialForm?: Form } = {}
  ) {
    const form = opts.form ?? f;
    const against = opts.base ?? base;
    if (evidenceDirty && !confirm(t("modal.unsavedEvidence"))) return;
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setNameError(true);
      // The field is at the top of a long form — take the user to it.
      nameRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      nameRef.current?.focus({ preventScroll: true });
      return;
    }
    setSaving(true);
    setSaveError(null);
    setConflict(false);
    const patch = diffPatch(patchFromForm(form, trimmedName), against);
    if (Object.keys(patch).length > 0) {
      const res = await updateItem(item.id, patch, {
        expectedUpdatedAt: against.updated_at,
      });
      if (!res.ok) {
        setSaving(false);
        if (res.conflict) setConflict(true);
        else setSaveError(describe(res));
        return;
      }
      // Saved: this is the new baseline (a retry below mustn't re-send it).
      const saved = { ...form, name: trimmedName };
      setBase(res.data);
      setInitial(saved);
      setF(saved);
    }
    // The staged AI pit-depth estimate goes in only once the item itself is
    // saved, so a failed save + Cancel never leaves the reading behind.
    // Re-check that no manual reading appeared since the AI apply.
    if (pendingAiReading !== null && item.readings.length === 0) {
      const r = await addReading(item.id, {
        reading_date: today(),
        depth_mm: pendingAiReading,
        location: AI_READING_LOCATION,
        checked_by: AI_READING_CHECKED_BY,
      });
      if (!r.ok) {
        setSaving(false);
        setSaveError(describe(r));
        return;
      }
      setPendingAiReading(null);
    }
    setSaving(false);
    clearItemDraft(profile.id, item.id);
    onClose();
  }

  // "Save mine on top": re-apply only the fields this user changed onto the
  // version that is in the database now (recomputing next inspection and
  // priority from the merged values), then save against that version.
  function saveOnTop() {
    const merged = rebase(item, f, initial);
    const fresh = formFromItem(item, false);
    setBase(item);
    setInitial(fresh);
    setF(merged);
    void save({ form: merged, base: item, initialForm: fresh });
  }

  // Throw the local edits away and start over from the current version.
  function reloadLatest() {
    const fresh = formFromItem(item, false);
    setBase(item);
    setInitial(fresh);
    setF(fresh);
    setPendingAiReading(null);
    setConflict(false);
    setSaveError(null);
    clearItemDraft(profile.id, item.id);
  }

  async function remove() {
    if (!confirm(t("common.confirmDelete"))) return;
    const r = await deleteItem(item.id);
    if (!r.ok) {
      setSaveError(t("modal.deleteFailed") + " " + r.error);
      return;
    }
    clearItemDraft(profile.id, item.id);
    onClose();
  }

  async function toggleArchived() {
    if (dirty && !confirm(t("modal.discardChanges"))) return;
    const r = await updateItem(item.id, { archived: !item.archived });
    if (!r.ok) {
      setSaveError(describe(r));
      return;
    }
    clearItemDraft(profile.id, item.id);
    onClose();
  }

  // May the modal close? Asks before throwing work away and, for a new
  // item, deletes the draft row. Shared by Cancel, ×, Escape and Back.
  async function confirmDiscard(): Promise<boolean> {
    if (saving) return false;
    if (isNew) {
      // Readings and photos are stored the moment they're added, so
      // discarding a new item deletes them too — say so first.
      const attached = item.readings.length + item.evidences.length > 0;
      if (
        (dirty || evidenceDirty || attached) &&
        !confirm(t("modal.discardNew"))
      ) {
        return false;
      }
      if (!gone) {
        const r = await deleteItem(item.id, { discardDraft: true });
        // Offline with an empty stub: close anyway — the server sweep
        // removes untouched stubs later. With photos/readings attached the
        // user must know they're still there.
        if (!r.ok && attached) {
          setSaveError(t("modal.deleteFailed") + " " + r.error);
          return false;
        }
      }
    } else if ((dirty || evidenceDirty) && !confirm(t("modal.discardChanges"))) {
      return false;
    }
    clearItemDraft(profile.id, item.id);
    return true;
  }

  const guardRef = useRef(confirmDiscard);
  guardRef.current = confirmDiscard;
  useEffect(() => {
    registerCloseGuard?.(() => guardRef.current());
  }, [registerCloseGuard]);

  async function cancel() {
    if (await confirmDiscard()) onClose();
  }

  function toggleResolved() {
    if (f.status === "OK" && f.resolved_at) {
      setF((x) => ({ ...x, status: "Attention", resolved_at: null }));
    } else {
      setF((x) => ({ ...x, status: "OK", resolved_at: today() }));
    }
  }

  const ifsValue: IfsObject | null = f.ifs_obj_id
    ? { id: f.ifs_obj_id, desc: f.ifs_obj_desc, sece: f.sece }
    : null;

  const blank = t("select.placeholder");
  const zoneOpts = [...zones]
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .map((z) => ({ v: z.zid, l: `${z.zid} — ${z.name}` }));
  const mechOpts = [{ v: "", l: blank }].concat(
    MECHANISMS.map((m) => ({ v: m, l: t(`mech.${m}` as DictKey) || m }))
  );
  const protOpts = [{ v: "", l: blank }].concat(
    PROTECTIONS.map((p) => ({ v: p, l: t(`prot.${p}` as DictKey) || p }))
  );
  const statusOpts = STATUSES.map((s) => ({
    v: s,
    l: t(`statusOpt.${s}` as DictKey) || s,
  }));
  const probOpts = [{ v: "", l: "-" }].concat(
    [1, 2, 3, 4, 5].map((i) => ({
      v: String(i),
      l: `${i} - ${t(`prob.${i}` as DictKey)}`,
    }))
  );
  const consOpts = [{ v: "", l: "-" }].concat(
    [1, 2, 3, 4, 5].map((i) => ({
      v: String(i),
      l: `${i} - ${t(`cons.${i}` as DictKey)}`,
    }))
  );
  const freqOpts = [{ v: "", l: blank }].concat(
    FREQUENCIES.map((fr) => ({ v: fr, l: t(`freq.${fr}` as DictKey) }))
  );
  const obsSourceOpts = [{ v: "", l: blank }].concat(
    OBS_SOURCES.map((s) => ({ v: s, l: t(`obsSrc.${s}` as DictKey) })).sort(
      (a, b) => a.l.localeCompare(b.l)
    )
  );

  const rpn = f.prob && f.cons ? f.prob * f.cons : null;
  const prClr = (f.priority && PRIORITY_COLOR[f.priority]) || DS.text3;

  return (
    <Modal labelledBy={titleId} onEscape={() => void cancel()}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              color: DS.blu,
              textTransform: "uppercase",
              letterSpacing: 2.5,
              fontWeight: 700,
              marginBottom: 3,
            }}
          >
            {isNew ? t("modal.newItem") + " " : t("modal.editItem") + " "}
            {zones.find((z) => z.zid === f.zone_id)?.name ?? zoneName}
          </div>
          <h2
            id={titleId}
            style={{ fontSize: 17, fontWeight: 800, color: DS.text, margin: 0 }}
          >
            {f.name || f.ifs_obj_desc || t("modal.untitled")}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void cancel()}
          aria-label={t("common.close")}
          style={{
            background: "none",
            border: "1px solid " + DS.bord,
            color: DS.text3,
            fontSize: 18,
            cursor: "pointer",
            borderRadius: 7,
            minWidth: 40,
            minHeight: 40,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      {gone && (
        <div role="alert" style={banner(DS.redBg, DS.redBord, DS.red)}>
          {t("modal.deletedElsewhere")}
        </div>
      )}
      {restorable && (
        <div role="status" style={banner(DS.bluBg, DS.bluBord, DS.blu)}>
          <span style={{ flex: 1 }}>
            {t("modal.draftFound")} (
            {new Date(restorable.savedAt).toLocaleString()}).
          </span>
          <button type="button" onClick={restoreDraft} style={bannerBtn(DS.blu)}>
            {t("modal.draftRestore")}
          </button>
          <button type="button" onClick={discardDraft} style={bannerBtn(DS.text3)}>
            {t("modal.draftDiscard")}
          </button>
        </div>
      )}

      <fieldset
        disabled={isReadOnly}
        style={{
          border: "none",
          padding: 0,
          margin: 0,
          minWidth: 0,
        }}
      >
      <Section title={t("sec.evidence")} accent={DS.vio}>
        <EvidencePanel
          itemId={item.id}
          evidences={item.evidences}
          isAdmin={isAdmin}
          canEdit={!isReadOnly}
          onAdd={(e) => addEvidence(item.id, e)}
          onRemove={(id) => deleteEvidence(id, item.id)}
          onAIApply={applyAI}
          onDirtyChange={setEvidenceDirty}
        />
      </Section>

      <Section title={t("sec.identification")} accent={DS.blu}>
        <div className="form-grid-2">
          <div>
            <Input
              ref={nameRef}
              label={t("f.itemName")}
              value={f.name}
              onChange={(v) => {
                set("name", v);
                if (nameError && v.trim()) setNameError(false);
              }}
              placeholder="ex: Anode Row 3 Port, FR-22"
              error={nameError ? t("modal.nameRequired") : null}
            />
          </div>
          <Select
            label={t("f.zone")}
            value={f.zone_id}
            onChange={(v) =>
              // Changing the zone always clears the sub-área — a sub-área
              // belongs to exactly one zone (DB trigger is the backstop).
              setF((x) => ({ ...x, zone_id: v, subarea_id: "" }))
            }
            options={zoneOpts}
          />
        </div>
        <div>
          <Select
            label={t("f.subarea")}
            value={f.subarea_id}
            onChange={(v) => set("subarea_id", v)}
            options={[{ v: "", l: t("subarea.none") }].concat(
              subareasByZone(f.zone_id).map((s) => ({ v: s.id, l: s.name }))
            )}
          />
          {isAdmin && !addingSubarea && (
            <button
              type="button"
              onClick={() => setAddingSubarea(true)}
              style={{
                background: "none",
                border: "none",
                color: DS.blu,
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                padding: 0,
                marginTop: -6,
                marginBottom: 8,
              }}
            >
              {t("subarea.add")}
            </button>
          )}
          {isAdmin && addingSubarea && (
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input
                value={newSubareaName}
                onChange={(e) => setNewSubareaName(e.target.value)}
                placeholder={t("subarea.namePlaceholder")}
                style={{ ...S.inp, marginBottom: 0, flex: 1 }}
              />
              <button
                type="button"
                disabled={savingSubarea || !newSubareaName.trim()}
                onClick={() => {
                  void (async () => {
                    setSavingSubarea(true);
                    const created = await createSubarea(
                      f.zone_id,
                      newSubareaName
                    );
                    setSavingSubarea(false);
                    if (created) {
                      set("subarea_id", created.id);
                      setNewSubareaName("");
                      setAddingSubarea(false);
                    }
                  })();
                }}
                style={{
                  background: DS.blu,
                  color: "#fff",
                  border: "none",
                  borderRadius: 7,
                  padding: "0 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: savingSubarea ? "default" : "pointer",
                  opacity: savingSubarea || !newSubareaName.trim() ? 0.6 : 1,
                }}
              >
                {t("common.add")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingSubarea(false);
                  setNewSubareaName("");
                }}
                style={{
                  background: "none",
                  border: "1px solid " + DS.bord,
                  color: DS.text3,
                  borderRadius: 7,
                  padding: "0 10px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>
          )}
        </div>
        <Select
          label={t("f.mechanism")}
          value={f.mechanism}
          onChange={(v) => set("mechanism", v)}
          options={mechOpts}
        />
        <Select
          label={t("f.protection")}
          value={f.protection}
          onChange={(v) => set("protection", v)}
          options={protOpts}
        />
        <Select
          label={t("f.obsSource")}
          value={f.obs_source}
          onChange={(v) => set("obs_source", v)}
          options={obsSourceOpts}
        />
      </Section>

      <Section title={t("sec.ifs")} accent={DS.grn}>
        <IfsObjectSearch
          value={ifsValue}
          onSelect={(o) =>
            // recalcPriority so a SECE flip (×1.5 weight) updates the
            // priority immediately. Two literals — passing `sece:
            // undefined` through the {...x, ...next} merge would clobber
            // the current value with undefined.
            recalcPriority(
              o
                ? { ifs_obj_id: o.id, ifs_obj_desc: o.desc, sece: o.sece }
                : { ifs_obj_id: "", ifs_obj_desc: "" }
            )
          }
        />
        {f.ifs_obj_id && (
          <div
            style={{
              background: DS.sur2,
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 12,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            <div>
              <Label>{t("f.objectIdShort")}</Label>
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 13,
                  color: DS.grn,
                }}
              >
                {f.ifs_obj_id}
              </span>
            </div>
            <div>
              <Label>{t("f.objectDesc")}</Label>
              <span style={{ fontSize: 13, color: DS.text2 }}>
                {f.ifs_obj_desc}
              </span>
            </div>
          </div>
        )}
        <Input
          label={t("f.wo")}
          value={f.ifs_wo}
          onChange={(v) => set("ifs_wo", v)}
          placeholder="ex: 320045678"
          mono
        />
        {/* Line accessory: the IFS object is the parent LINE; this item is
            an accessory (support/valve/flange) installed on it. */}
        <div style={{ marginTop: 4 }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: DS.text2,
              fontWeight: 600,
              cursor: "pointer",
              marginBottom: 4,
            }}
          >
            <input
              type="checkbox"
              checked={f.is_accessory}
              onChange={(e) =>
                setF((x) => ({
                  ...x,
                  is_accessory: e.target.checked,
                  accessory_type: e.target.checked ? x.accessory_type : "",
                }))
              }
              style={{ cursor: "pointer" }}
            />
            {t("f.isAccessory")}
          </label>
          <div style={{ fontSize: 10, color: DS.text3, marginBottom: 8 }}>
            {t("f.isAccessoryHint")}
          </div>
          {f.is_accessory && (
            <Select
              label={t("f.accessoryType")}
              value={f.accessory_type}
              onChange={(v) => set("accessory_type", v as AccessoryType | "")}
              options={[{ v: "", l: blank }].concat(
                ACCESSORY_TYPES.map((a) => ({
                  v: a,
                  l: t(`accType.${a}` as DictKey) || a,
                }))
              )}
            />
          )}
        </div>
      </Section>

      <Section title={t("sec.risk")} accent={DS.vio}>
        <div
          className="form-grid-2"
          style={{ marginBottom: 12 }}
        >
          <Select
            label={t("f.probability")}
            value={f.prob ? String(f.prob) : ""}
            onChange={(v) =>
              recalcPriority({ prob: v ? parseInt(v, 10) : null })
            }
            options={probOpts}
          />
          <Select
            label={t("f.consequence")}
            value={f.cons ? String(f.cons) : ""}
            onChange={(v) =>
              recalcPriority({ cons: v ? parseInt(v, 10) : null })
            }
            options={consOpts}
          />
        </div>
        <div
          className="form-grid-3"
          style={{ marginBottom: 12 }}
        >
          <div>
            <Label>{t("f.priorityAuto")}</Label>
            <div
              style={{
                background: prClr + "18",
                border: "1px solid " + prClr + "44",
                borderRadius: 7,
                padding: "8px 11px",
                fontWeight: 800,
                fontSize: 14,
                color: prClr,
                textAlign: "center",
                height: 36,
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {f.priority ? t(`priority.${f.priority}`) : (f.prob && f.cons ? t("f.calculating") : t("f.setPC"))}
            </div>
          </div>
          <div>
            <Label>RPN</Label>
            <div
              style={{
                background: DS.sur2,
                border: "1px solid " + DS.bord,
                borderRadius: 7,
                padding: "8px 11px",
                fontWeight: 800,
                fontSize: 18,
                color: DS.text2,
                textAlign: "center",
                fontFamily: "monospace",
                height: 36,
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {rpn ?? "-"}
            </div>
          </div>
          <Select
            label={t("f.status")}
            value={f.status}
            onChange={(v) => set("status", v as ItemStatus)}
            options={statusOpts}
          />
        </div>
        <div
          style={{
            background: DS.sur2,
            border: "1px solid " + DS.bord,
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 10,
            fontSize: 11,
            color: DS.text3,
          }}
        >
          <span style={{ fontWeight: 700, color: DS.text2 }}>
            {t("f.priorityLogicLabel")}{" "}
          </span>
          {t("f.priorityLogicBody")}
          <span style={{ fontFamily: "monospace", color: DS.vio }}>
            {t("f.priorityLogicTiers")}
          </span>
        </div>
        <div>
          <Label>{t("ifs.seceNote")}</Label>
          {/* Auto-populated from the IFS Equipment Register. Not editable —
              select an IFS Object above and the flag flows from there. */}
          <div
            style={{
              background: f.sece ? DS.redBg : DS.sur2,
              border:
                "1px solid " + (f.sece ? DS.redBord : DS.bord),
              color: f.sece ? DS.red : DS.text3,
              borderRadius: 6,
              padding: "9px 12px",
              fontSize: 12,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span>
              {f.ifs_obj_id
                ? f.sece
                  ? t("sece.yes") : t("sece.no")
                : "—"}
            </span>
            <span style={{ fontSize: 10, fontWeight: 500, color: DS.text3 }}>
              {f.ifs_obj_id ? null : t("f.seceSelect")}
            </span>
          </div>
        </div>

        {/* DROPS + Structural — additional risk contributors (+2 each on
            priority weight). Manually toggled, unlike SECE which is
            sourced from IFS. */}
        <div
          className="form-grid-2"
          style={{ marginTop: 12 }}
        >
          <YesNoToggle
            label={t("f.dropsRisk")}
            value={f.drops_risk}
            onChange={(v) => recalcPriority({ drops_risk: v })}
            yesLabel={t("sece.yes")}
            noLabel={t("sece.no")}
          />
          <YesNoToggle
            label={t("f.structural")}
            value={f.structural}
            onChange={(v) => recalcPriority({ structural: v })}
            yesLabel={t("sece.yes")}
            noLabel={t("sece.no")}
          />
        </div>

        {/* Informative assessment bands (FM-116-OFF method). Handlers go
            through onBandChange — the seam where a future
            suggestRiskFromBands(corr, loss) can swap `set` for
            recalcPriority to also suggest P×C. */}
        <div
          className="form-grid-2"
          style={{ marginTop: 12 }}
        >
          <Select
            label={t("f.corrExtent")}
            value={f.corr_extent_band}
            onChange={(v) => onBandChange({ corr_extent_band: v as CorrExtentBand | "" })}
            options={[{ v: "", l: "-" }].concat(
              CORR_EXTENT_BANDS.map((b) => ({ v: b, l: `${b}%` }))
            )}
          />
          <Select
            label={t("f.materialLoss")}
            value={f.material_loss_band}
            onChange={(v) => onBandChange({ material_loss_band: v as MaterialLossBand | "" })}
            options={[{ v: "", l: "-" }].concat(
              MATERIAL_LOSS_BANDS.map((b) => ({ v: b, l: `${b}%` }))
            )}
          />
        </div>
        <div style={{ fontSize: 10, color: DS.text3, marginTop: 4 }}>
          {t("f.bandsInfo")}
        </div>
      </Section>

      <Section title={t("sec.inspection")} accent={DS.ora}>
        <div
          className="form-grid-3"
          style={{ alignItems: "end" }}
        >
          <div>
            <Label htmlFor={fid + "freq"}>{t("f.frequency")}</Label>
            <select
              id={fid + "freq"}
              value={f.freq_insp ?? ""}
              onChange={(e) =>
                onFreqOrLast({
                  freq_insp: (e.target.value || null) as
                    | InspectionFrequency
                    | null,
                })
              }
              style={{ ...S.inp, marginBottom: 0 }}
            >
              {freqOpts.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor={fid + "last"}>{t("f.lastInsp")}</Label>
            <input
              id={fid + "last"}
              type="date"
              value={f.last_insp ?? ""}
              onChange={(e) =>
                onFreqOrLast({ last_insp: e.target.value || null })
              }
              style={{ ...S.inp, marginBottom: 0 }}
            />
          </div>
          <div>
            <Label>{t("f.nextInsp")}</Label>
            <div
              style={{
                background: DS.sur2,
                border: "1px solid " + DS.bord,
                borderRadius: 7,
                padding: "0 11px",
                fontSize: 13,
                fontFamily: "monospace",
                color: f.next_insp ? DS.text : DS.text3,
                height: 36,
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
              }}
            >
              {f.next_insp ?? "—"}
            </div>
          </div>
        </div>
      </Section>

      <Section title={t("sec.action")} accent={DS.grn}>
        <div
          className="form-grid-2"
          style={{ marginBottom: 10 }}
        >
          <Select
            label={t("f.actionType")}
            value={f.action_type}
            onChange={onActionTypeChange}
            options={[{ v: "", l: blank }].concat(
              ACTION_TYPES.map((a) => ({
                v: a,
                l: t(`actionType.${a}` as DictKey) || a,
              }))
            )}
          />
          <Select
            label={t("f.actionStatus")}
            value={f.action_type ? f.action_status || "Sem planejamento" : ""}
            onChange={(v) => set("action_status", v as ActionStatus | "")}
            options={
              f.action_type
                ? ACTION_STATUSES.map((s) => ({
                    v: s,
                    l: t(`actionStatus.${s}` as DictKey) || s,
                  }))
                : [{ v: "", l: "—" }]
            }
          />
        </div>
        <div
          className="form-grid-2"
          style={{ alignItems: "end", marginBottom: 4 }}
        >
          <div>
            <Label htmlFor={fid + "due"}>{t("f.actionDue")}</Label>
            <input
              id={fid + "due"}
              type="date"
              value={f.action_due ?? ""}
              onChange={(e) => set("action_due", e.target.value || null)}
              style={{ ...S.inp, marginBottom: 0 }}
            />
          </div>
          <div style={{ fontSize: 10, color: DS.text3, paddingBottom: 10 }}>
            {f.action_type ? t("f.actionDueSuggested") : null}
          </div>
        </div>
        {f.action_type && (f.action_status || "Sem planejamento") === "Executado" && (
          <div
            style={{
              background: DS.grnBg,
              border: "1px solid " + DS.grnBord,
              borderRadius: 8,
              padding: "8px 12px",
              marginBottom: 10,
              fontSize: 11,
              color: DS.grn,
            }}
          >
            {t("f.actionDoneHint")}
          </div>
        )}
        <Textarea
          label={t("f.actionNote")}
          value={f.action_note}
          onChange={(v) => set("action_note", v)}
          rows={2}
        />
      </Section>

      <Section title={t("sec.pit")} accent={DS.ora}>
        {pendingAiReading !== null && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              background: DS.bluBg,
              border: "1px solid " + DS.bluBord,
              borderRadius: 8,
              padding: "8px 12px",
              marginBottom: 10,
              fontSize: 12,
              color: DS.blu,
            }}
          >
            <span>
              {t("modal.pendingAiReading")} {pendingAiReading} mm
            </span>
            <button
              type="button"
              onClick={() => setPendingAiReading(null)}
              aria-label="Discard AI reading"
              style={{
                background: "none",
                border: "none",
                color: DS.blu,
                cursor: "pointer",
                fontSize: 14,
                padding: "0 2px",
              }}
            >
              ×
            </button>
          </div>
        )}
        <ReadingsPanel
          readings={item.readings}
          onAdd={(r) => addReading(item.id, r)}
          onRemove={(id) => deleteReading(id, item.id)}
          canEdit={!isReadOnly}
          canDelete={isAdmin}
        />
      </Section>

      {!isNew && (
        <Section title={t("sec.history")} accent={DS.text3}>
          <HistoryPanel itemId={item.id} />
        </Section>
      )}

      <Section title={t("sec.notes")} accent={DS.text3}>
        <Textarea
          value={f.notes}
          onChange={(v) => set("notes", v)}
          rows={3}
        />
      </Section>
      </fieldset>

      {/* Sticky action bar: Save stays reachable at the bottom of this long
          form, and save errors/conflicts show right next to it. */}
      <div className="modal-footer">
      <div ref={errorRef} aria-live="assertive">
        {conflict && (
          <div role="alert" style={banner(DS.oraBg, DS.oraBord, DS.ora)}>
            <span style={{ flex: "1 1 220px" }}>{t("modal.conflict")}</span>
            <button
              type="button"
              disabled={saving}
              onClick={saveOnTop}
              style={bannerBtn(DS.ora)}
            >
              {t("modal.conflictOverwrite")}
            </button>
            <button type="button" onClick={reloadLatest} style={bannerBtn(DS.text3)}>
              {t("modal.conflictReload")}
            </button>
          </div>
        )}
        {saveError && (
          <div role="alert" style={banner(DS.redBg, DS.redBord, DS.red)}>
            <span style={{ flex: 1 }}>{saveError}</span>
            <button
              type="button"
              onClick={() => setSaveError(null)}
              aria-label={t("common.dismiss")}
              style={bannerBtn(DS.red)}
            >
              ×
            </button>
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/* Destructive action lives here, away from the close button. */}
          {!isNew && isAdmin && (
            <button
              type="button"
              onClick={() => void remove()}
              style={{
                background: DS.redBg,
                color: DS.red,
                border: "1px solid " + DS.redBord,
                borderRadius: 8,
                padding: "9px 14px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {t("common.delete")}
            </button>
          )}
          {!isNew && isAdmin && (
            <button
              type="button"
              onClick={() => void toggleArchived()}
              style={{
                background: DS.sur2,
                color: DS.text3,
                border: "1px solid " + DS.bord,
                borderRadius: 8,
                padding: "9px 18px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {item.archived ? t("modal.unarchive") : t("modal.archive")}
            </button>
          )}
          {!isReadOnly && (
            <button
              onClick={toggleResolved}
              style={{
                background:
                  f.status === "OK" && f.resolved_at ? DS.grnBg : DS.sur2,
                color:
                  f.status === "OK" && f.resolved_at ? DS.grn : DS.text3,
                border:
                  "1px solid " +
                  (f.status === "OK" && f.resolved_at
                    ? DS.grnBord
                    : DS.bord),
                borderRadius: 8,
                padding: "9px 18px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 700,
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 14 }}>
                {f.status === "OK" && f.resolved_at ? "✓" : "○"}
              </span>
              {f.status === "OK" && f.resolved_at
                ? t("modal.resolved") : t("modal.markResolved")}
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => void cancel()}
            style={{
              background: "transparent",
              color: DS.text3,
              border: "1px solid " + DS.bord,
              borderRadius: 8,
              padding: "10px 22px",
              cursor: "pointer",
              fontSize: 14,
            }}
          >{t("common.cancel")}</button>
          {!isReadOnly && (
            <button
              onClick={() => void save()}
              disabled={saving}
              style={{
                background: DS.blu,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "10px 28px",
                fontWeight: 700,
                cursor: saving ? "default" : "pointer",
                fontSize: 14,
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? t("common.saving") : isNew ? t("modal.createItem") : t("common.save")}
            </button>
          )}
        </div>
      </div>
      </div>
    </Modal>
  );
}

function banner(bg: string, border: string, color: string): React.CSSProperties {
  return {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    background: bg,
    border: "1px solid " + border,
    borderRadius: 8,
    padding: "10px 12px",
    marginBottom: 12,
    fontSize: 12,
    color,
  };
}

function bannerBtn(color: string): React.CSSProperties {
  return {
    background: "none",
    border: "1px solid " + color,
    color,
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    minHeight: 32,
  };
}
