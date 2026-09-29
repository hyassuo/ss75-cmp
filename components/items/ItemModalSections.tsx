"use client";

// Sections of the item modal, split out of ItemModal.tsx. Each is a pure
// view over the form state it receives; all state and save logic stay in
// ItemModal (and itemForm.ts).

import { useId, type Dispatch, type SetStateAction } from "react";
import { Section } from "@/components/ui/Section";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Label } from "@/components/ui/Label";
import { YesNoToggle } from "@/components/ui/YesNoToggle";
import { Notice } from "@/components/ui/Notice";
import { IfsObjectSearch } from "@/components/items/IfsObjectSearch";
import { S } from "@/lib/design/styles";
import { DS, tint } from "@/lib/design/tokens";
import { useLang } from "@/lib/context/LangContext";
import type { DictKey } from "@/lib/i18n/dict";
import {
  STATUSES,
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
  CorrExtentBand,
  IfsObject,
  InspectionFrequency,
  ItemStatus,
  MaterialLossBand,
} from "@/lib/types/domain";
import type { Form, SetField } from "@/components/items/itemForm";

export function IfsSection({ f, set, setF, recalcPriority }: {
  f: Form;
  set: SetField;
  setF: Dispatch<SetStateAction<Form>>;
  recalcPriority: (next: Partial<Form>) => void;
}) {
  const { t } = useLang();
  const blank = t("select.placeholder");
  const ifsValue: IfsObject | null = f.ifs_obj_id
    ? { id: f.ifs_obj_id, desc: f.ifs_obj_desc, sece: f.sece }
    : null;
  return (
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
                fontSize: DS.fs.base,
                color: DS.grn,
              }}
            >
              {f.ifs_obj_id}
            </span>
          </div>
          <div>
            <Label>{t("f.objectDesc")}</Label>
            <span style={{ fontSize: DS.fs.base, color: DS.text2 }}>
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
            fontSize: DS.fs.md,
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
        <div style={{ fontSize: DS.fs.xs, color: DS.text3, marginBottom: 8 }}>
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
  );
}

export function RiskSection({ f, set, recalcPriority, onBandChange }: {
  f: Form;
  set: SetField;
  recalcPriority: (next: Partial<Form>) => void;
  onBandChange: (next: Partial<Form>) => void;
}) {
  const { t } = useLang();
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
  const rpn = f.prob && f.cons ? f.prob * f.cons : null;
  const prClr = (f.priority && PRIORITY_COLOR[f.priority]) || DS.text3;
  return (
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
              background: tint(prClr, 9),
              border: "1px solid " + tint(prClr, 27),
              borderRadius: 7,
              padding: "8px 11px",
              fontWeight: 800,
              fontSize: DS.fs.lg,
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
              fontSize: DS.fs.h3,
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
          fontSize: DS.fs.sm,
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
            fontSize: DS.fs.md,
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
          <span style={{ fontSize: DS.fs.xs, fontWeight: 500, color: DS.text3 }}>
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
      <div style={{ fontSize: DS.fs.xs, color: DS.text3, marginTop: 4 }}>
        {t("f.bandsInfo")}
      </div>
    </Section>
  );
}

export function InspectionSection({ f, onFreqOrLast }: {
  f: Form;
  onFreqOrLast: (next: Partial<Form>) => void;
}) {
  const { t } = useLang();
  const blank = t("select.placeholder");
  const fid = useId();
  const freqOpts = [{ v: "", l: blank }].concat(
    FREQUENCIES.map((fr) => ({ v: fr, l: t(`freq.${fr}` as DictKey) }))
  );
  return (
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
              fontSize: DS.fs.base,
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
  );
}

export function ActionSection({ f, set, onActionTypeChange }: {
  f: Form;
  set: SetField;
  onActionTypeChange: (v: string) => void;
}) {
  const { t } = useLang();
  const blank = t("select.placeholder");
  const fid = useId();
  return (
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
        <div style={{ fontSize: DS.fs.xs, color: DS.text3, paddingBottom: 10 }}>
          {f.action_type ? t("f.actionDueSuggested") : null}
        </div>
      </div>
      {f.action_type && (f.action_status || "Sem planejamento") === "Executado" && (
        <Notice tone="success" role={null} style={{ padding: "8px 12px", marginBottom: 10 }}>
          {t("f.actionDoneHint")}
        </Notice>
      )}
      <Textarea
        label={t("f.actionNote")}
        value={f.action_note}
        onChange={(v) => set("action_note", v)}
        rows={2}
      />
    </Section>
  );
}
