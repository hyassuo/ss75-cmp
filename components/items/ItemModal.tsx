"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Section } from "@/components/ui/Section";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Label } from "@/components/ui/Label";
import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";
import { EvidencePanel } from "@/components/items/EvidencePanel";
import { ReadingsPanel } from "@/components/items/ReadingsPanel";
import { HistoryPanel } from "@/components/items/HistoryPanel";
import { IfsObjectSearch } from "@/components/items/IfsObjectSearch";
import { useData } from "@/lib/context/DataContext";
import { useLang } from "@/lib/context/LangContext";
import type { DictKey } from "@/lib/i18n/dict";
import { calcPriority } from "@/lib/domain/calcPriority";
import { calcNextInspection } from "@/lib/domain/calcNextInspection";
import { today } from "@/lib/utils/format";
import {
  MECHANISMS,
  PROTECTIONS,
  STATUSES,
  OBS_SOURCES,
  FREQUENCIES,
  PRIORITY_COLOR,
} from "@/lib/utils/constants";
import type {
  AIAnalysis,
  IfsObject,
  InspectionFrequency,
  Item,
  ItemPriority,
  ItemStatus,
  ItemWithRelations,
} from "@/lib/types/domain";

interface Props {
  itemId: string;
  zoneName: string;
  isNew: boolean;
  onClose: () => void;
}

type Form = {
  name: string;
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
  notes: string;
};

export function ItemModal(props: Props) {
  const { allItems } = useData();
  const item = allItems.find((i) => i.id === props.itemId);
  if (!item) return null;
  return <ItemModalInner {...props} item={item} />;
}

function ItemModalInner({
  zoneName,
  isNew,
  onClose,
  item,
}: Props & { item: ItemWithRelations }) {
  const {
    profile,
    updateItem,
    deleteItem,
    addReading,
    deleteReading,
    addEvidence,
    deleteEvidence,
  } = useData();
  const { t } = useLang();

  const [f, setF] = useState<Form>(() => ({
    // On a freshly created draft the DB row carries the "Untitled" fallback;
    // surface it as an empty field so the user types their own name instead
    // of having to manually erase the placeholder text.
    name:
      item.name && item.name !== "Untitled" && item.name !== "Sem nome"
        ? item.name
        : "",
    mechanism: item.mechanism ?? "",
    protection: item.protection ?? "",
    ifs_obj_id: item.ifs_obj_id ?? "",
    ifs_obj_desc: item.ifs_obj_desc ?? "",
    ifs_wo: item.ifs_wo ?? "",
    ifs_fl: item.ifs_fl ?? "",
    prob: item.prob ?? null,
    cons: item.cons ?? null,
    priority: item.priority ?? null,
    status: item.status ?? "Pending",
    sece: item.sece ?? false,
    drops_risk: item.drops_risk ?? false,
    structural: item.structural ?? false,
    obs_source: item.obs_source ?? "",
    freq_insp: item.freq_insp ?? null,
    last_insp: item.last_insp ?? null,
    next_insp: item.next_insp ?? null,
    resolved_at: item.resolved_at ?? null,
    notes: item.notes ?? "",
  }));
  const [saving, setSaving] = useState(false);

  const isReadOnly = profile.role === "viewer";
  const isAdmin = profile.role === "admin";

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
      return { ...merged, priority: p ?? merged.priority };
    });
  }

  function onFreqOrLast(next: Partial<Form>) {
    setF((x) => {
      const merged = { ...x, ...next };
      const ni = calcNextInspection(merged.last_insp, merged.freq_insp);
      const withNi = { ...merged, next_insp: ni ?? merged.next_insp };
      const p = calcPriority(
        withNi.prob,
        withNi.cons,
        withNi.sece,
        withNi.next_insp,
        withNi.drops_risk,
        withNi.structural
      );
      return { ...withNi, priority: p ?? withNi.priority };
    });
  }

  function applyAI(r: AIAnalysis) {
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
      if (r.corrosionType && mechMap[r.corrosionType]) {
        next.mechanism = mechMap[r.corrosionType];
      }
      // Set the inputs to the risk matrix and let calcPriority derive the
      // priority — the AI never chooses the priority directly.
      if (r.probability >= 1 && r.probability <= 5) next.prob = r.probability;
      if (r.consequence >= 1 && r.consequence <= 5) next.cons = r.consequence;
      const p = calcPriority(
        next.prob,
        next.cons,
        next.sece,
        next.next_insp,
        next.drops_risk,
        next.structural
      );
      if (p) next.priority = p;
      // Status maps from the AI's recommended action: urgent → Critical,
      // anything else nudging us to act → Attention.
      if (r.immediateAction === "Urgent Treatment Required") {
        next.status = "Critical";
      } else if (
        r.immediateAction === "Treat Soon" ||
        r.immediateAction === "Inspect Closely"
      ) {
        next.status = "Attention";
      }
      return next;
    });
    if (r.pitDepthEstMM > 0 && item.readings.length === 0) {
      void addReading(item.id, {
        reading_date: today(),
        depth_mm: r.pitDepthEstMM,
        location: "AI estimate",
        checked_by: "AI Vision",
      });
    }
  }

  async function save() {
    setSaving(true);
    const patch: Partial<Item> = {
      name: f.name || t("modal.untitled"),
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
    await updateItem(item.id, patch);
    setSaving(false);
    onClose();
  }

  async function remove() {
    if (!confirm(t("common.confirmDelete"))) return;
    await deleteItem(item.id);
    onClose();
  }

  async function cancel() {
    if (isNew) {
      // Discard the freshly-created draft row.
      await deleteItem(item.id);
    }
    onClose();
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
    OBS_SOURCES.map((s) => ({ v: s, l: t(`obsSrc.${s}` as DictKey) }))
  );

  const rpn = f.prob && f.cons ? f.prob * f.cons : null;
  const prClr = (f.priority && PRIORITY_COLOR[f.priority]) || DS.text3;

  return (
    <Modal onClose={cancel}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
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
            {zoneName}
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: DS.text }}>
            {f.name || f.ifs_obj_desc || t("modal.untitled")}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!isNew && isAdmin && (
            <button
              onClick={() => void remove()}
              style={{
                background: DS.redBg,
                color: DS.red,
                border: "1px solid " + DS.redBord,
                borderRadius: 7,
                padding: "6px 14px",
                fontSize: 12,
                cursor: "pointer",
                fontWeight: 700,
              }}
            >{t("common.delete")}</button>
          )}
          <button
            onClick={() => void cancel()}
            style={{
              background: "none",
              border: "1px solid " + DS.bord,
              color: DS.text3,
              fontSize: 16,
              cursor: "pointer",
              borderRadius: 7,
              padding: "6px 11px",
            }}
          >
            ×
          </button>
        </div>
      </div>

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
        <div style={{ fontSize: 12, color: DS.text3, marginBottom: 10 }}>
          Start by adding a photo. AI analysis will auto-populate corrosion
          type, severity and suggested priority.
        </div>
        <EvidencePanel
          itemId={item.id}
          evidences={item.evidences}
          isAdmin={isAdmin}
          canEdit={!isReadOnly}
          onAdd={(e) => addEvidence(item.id, e)}
          onRemove={(id) => void deleteEvidence(id, item.id)}
          onAIApply={applyAI}
        />
      </Section>

      <Section title={t("sec.identification")} accent={DS.blu}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          <Input
            label={t("f.itemName")}
            value={f.name}
            onChange={(v) => set("name", v)}
            placeholder="ex: Anode Row 3 Port, FR-22"
          />
          <Select
            label={t("f.mechanism")}
            value={f.mechanism}
            onChange={(v) => set("mechanism", v)}
            options={mechOpts}
          />
        </div>
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
            setF((x) => ({
              ...x,
              ifs_obj_id: o?.id ?? "",
              ifs_obj_desc: o?.desc ?? "",
              sece: o ? o.sece : x.sece,
            }))
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
              <Label>Object ID</Label>
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
              <Label>Object Description</Label>
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
      </Section>

      <Section title={t("sec.risk")} accent={DS.vio}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginBottom: 12,
          }}
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
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 10,
            marginBottom: 12,
          }}
        >
          <div>
            <Label>Priority (auto)</Label>
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
          <Label>SECE (Safety &amp; Environmental Critical Element)</Label>
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
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginTop: 12,
          }}
        >
          <div>
            <Label>{t("f.dropsRisk")}</Label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => recalcPriority({ drops_risk: true })}
                style={{
                  flex: 1,
                  background: f.drops_risk ? DS.oraBg : DS.sur2,
                  color: f.drops_risk ? DS.ora : DS.text3,
                  border:
                    "1px solid " +
                    (f.drops_risk ? DS.oraBord : DS.bord),
                  borderRadius: 6,
                  padding: "7px 0",
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                {t("sece.yes")}
              </button>
              <button
                type="button"
                onClick={() => recalcPriority({ drops_risk: false })}
                style={{
                  flex: 1,
                  background: !f.drops_risk ? DS.grnBg : DS.sur2,
                  color: !f.drops_risk ? DS.grn : DS.text3,
                  border:
                    "1px solid " +
                    (!f.drops_risk ? DS.grnBord : DS.bord),
                  borderRadius: 6,
                  padding: "7px 0",
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                {t("sece.no")}
              </button>
            </div>
          </div>
          <div>
            <Label>{t("f.structural")}</Label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => recalcPriority({ structural: true })}
                style={{
                  flex: 1,
                  background: f.structural ? DS.oraBg : DS.sur2,
                  color: f.structural ? DS.ora : DS.text3,
                  border:
                    "1px solid " +
                    (f.structural ? DS.oraBord : DS.bord),
                  borderRadius: 6,
                  padding: "7px 0",
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                {t("sece.yes")}
              </button>
              <button
                type="button"
                onClick={() => recalcPriority({ structural: false })}
                style={{
                  flex: 1,
                  background: !f.structural ? DS.grnBg : DS.sur2,
                  color: !f.structural ? DS.grn : DS.text3,
                  border:
                    "1px solid " +
                    (!f.structural ? DS.grnBord : DS.bord),
                  borderRadius: 6,
                  padding: "7px 0",
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                {t("sece.no")}
              </button>
            </div>
          </div>
        </div>
      </Section>

      <Section title={t("sec.inspection")} accent={DS.ora}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 10,
            alignItems: "end",
          }}
        >
          <div>
            <Label>{t("f.frequency")}</Label>
            <select
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
            <Label>{t("f.lastInsp")}</Label>
            <input
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

      <Section title={t("sec.pit")} accent={DS.ora}>
        <ReadingsPanel
          readings={item.readings}
          onAdd={(r) => void addReading(item.id, r)}
          onRemove={(id) => void deleteReading(id, item.id)}
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

      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 12,
          borderTop: "1px solid " + DS.bord,
          flexWrap: "wrap",
        }}
      >
        <div>
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
    </Modal>
  );
}
