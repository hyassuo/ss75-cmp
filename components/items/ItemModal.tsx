"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Section } from "@/components/ui/Section";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";
import { EvidencePanel } from "@/components/items/EvidencePanel";
import { ReadingsPanel } from "@/components/items/ReadingsPanel";
import { HistoryPanel } from "@/components/items/HistoryPanel";
import { useData, type MutationResult } from "@/lib/context/DataContext";
import {
  diffPatch,
  formFromItem,
  patchFromForm,
  rebase,
  sameForm,
  type Form,
} from "@/components/items/itemForm";
import {
  ActionSection,
  IfsSection,
  InspectionSection,
  RiskSection,
} from "@/components/items/ItemModalSections";
import { useLang } from "@/lib/context/LangContext";
import type { DictKey } from "@/lib/i18n/dict";
import { calcPriority } from "@/lib/domain/calcPriority";
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
  OBS_SOURCES,
  FREQUENCIES,
} from "@/lib/utils/constants";
import type {
  ActionType,
  AIAnalysis,
  InspectionFrequency,
  ItemWithRelations,
} from "@/lib/types/domain";
import { useFeedback } from "@/lib/context/FeedbackContext";

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
  const { confirm, toast } = useFeedback();

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
    if (evidenceDirty && !(await confirm(t("modal.unsavedEvidence")))) return;
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
    toast(t("toast.itemSaved"));
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
    if (
      !(await confirm({
        message: t("common.confirmDelete"),
        confirmLabel: t("common.delete"),
        danger: true,
      }))
    ) {
      return;
    }
    const r = await deleteItem(item.id);
    if (!r.ok) {
      setSaveError(t("modal.deleteFailed") + " " + r.error);
      return;
    }
    clearItemDraft(profile.id, item.id);
    onClose();
  }

  async function toggleArchived() {
    if (dirty && !(await confirm(t("modal.discardChanges")))) return;
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
  const closing = useRef(false);
  async function confirmDiscard(): Promise<boolean> {
    // One close at a time: Cancel still deleting a draft while Back fires
    // must not run the checks (and the navigation) twice.
    if (saving || closing.current) return false;
    closing.current = true;
    const ok = await confirmDiscardOnce();
    closing.current = false;
    return ok;
  }

  async function confirmDiscardOnce(): Promise<boolean> {
    if (isNew) {
      // Readings and photos are stored the moment they're added, so
      // discarding a new item deletes them too — say so first.
      const attached = item.readings.length + item.evidences.length > 0;
      if (
        (dirty || evidenceDirty || attached) &&
        !(await confirm({
          message: t("modal.discardNew"),
          confirmLabel: t("modal.draftDiscard"),
          danger: true,
        }))
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
    } else if (
      (dirty || evidenceDirty) &&
      !(await confirm({
        message: t("modal.discardChanges"),
        confirmLabel: t("modal.draftDiscard"),
        danger: true,
      }))
    ) {
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




  const obsSourceOpts = [{ v: "", l: blank }].concat(
    OBS_SOURCES.map((s) => ({ v: s, l: t(`obsSrc.${s}` as DictKey) })).sort(
      (a, b) => a.l.localeCompare(b.l)
    )
  );


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
            minWidth: 44,
            minHeight: 44,
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
                  color: DS.onAccent,
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

      <IfsSection
        f={f}
        set={set}
        setF={setF}
        recalcPriority={recalcPriority}
      />

      <RiskSection
        f={f}
        set={set}
        recalcPriority={recalcPriority}
        onBandChange={onBandChange}
      />

      <InspectionSection f={f} onFreqOrLast={onFreqOrLast} />

      <ActionSection f={f} set={set} onActionTypeChange={onActionTypeChange} />

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
              aria-label={t("modal.discardAiReading")}
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
                color: DS.onAccent,
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
