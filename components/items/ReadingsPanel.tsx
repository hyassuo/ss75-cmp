"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { S } from "@/lib/design/styles";
import { DS, tint } from "@/lib/design/tokens";
import { Icon } from "@/components/ui/Icon";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { useLang } from "@/lib/context/LangContext";
import { fmt, fmtNum, today } from "@/lib/utils/format";
import {
  calcRate,
  isAiEstimate,
  RATE_CRITICAL_MM_YR,
  RATE_ELEVATED_MM_YR,
  rateColor,
} from "@/lib/domain/calcRate";
import type { Reading } from "@/lib/types/domain";
import { useFeedback } from "@/lib/context/FeedbackContext";

type Outcome = { ok: true } | { ok: false; error: string };

interface Props {
  readings: Reading[];
  onAdd: (r: {
    reading_date: string;
    depth_mm: number;
    location: string | null;
    checked_by: string | null;
  }) => Promise<Outcome>;
  onRemove: (id: string) => Promise<Outcome>;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function ReadingsPanel({
  readings,
  onAdd,
  onRemove,
  canEdit = true,
  canDelete = true,
}: Props) {
  const { lang, t } = useLang();
  const { confirm, toast } = useFeedback();
  const [date, setDate] = useState(today());
  const [depth, setDepth] = useState("");
  const [loc, setLoc] = useState("");
  const [tech, setTech] = useState("");
  const [busy, setBusy] = useState(false);
  const fid = useId();
  const [err, setErr] = useState("");

  const sorted = [...readings].sort((a, b) =>
    a.reading_date.localeCompare(b.reading_date)
  );
  const rate = calcRate(readings);
  const measured = readings.filter((r) => !isAiEstimate(r)).length;

  async function add() {
    if (busy || !depth.trim()) return;
    // Plain decimal only: Number() would also take "0x10" or "1e2".
    // Accept a decimal comma too ("1,5"), the norm on pt-BR keyboards.
    const txt = depth.trim();
    if (!/^\d+([.,]\d+)?$/.test(txt)) {
      setErr(t("readings.invalidDepth"));
      return;
    }
    const mm = Number(txt.replace(",", "."));
    // depth_mm is numeric(6,3): anything ≥ 1000 mm would be rejected by the
    // database with a raw overflow error.
    if (mm >= 1000) {
      setErr(t("readings.invalidDepth"));
      return;
    }
    if (!date) {
      setErr(t("readings.missingDate"));
      return;
    }
    if (date > today()) {
      setErr(t("readings.futureDate"));
      return;
    }
    setErr("");
    setBusy(true);
    try {
      const res = await onAdd({
        reading_date: date,
        depth_mm: mm,
        location: loc || null,
        checked_by: tech || null,
      });
      if (!res.ok) {
        // Keep what was typed so the user can retry.
        setErr(t("readings.saveFailed") + " " + res.error);
        return;
      }
      setDate(today());
      setDepth("");
      setLoc("");
      setTech("");
      toast(t("toast.readingSaved"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (
      !(await confirm({
        message: t("readings.confirmDelete"),
        confirmLabel: t("common.delete"),
        danger: true,
      }))
    ) {
      return;
    }
    setErr("");
    const res = await onRemove(id);
    if (!res.ok) setErr(t("common.deleteFailed") + " " + res.error);
  }

  return (
    <div>
      {canEdit && (
      <div
        style={{
          background: DS.sur2,
          border: "1px solid " + DS.bord,
          borderRadius: 8,
          padding: 14,
          marginBottom: 12,
        }}
      >
        <div
          className="form-grid-3"
          style={{ alignItems: "end", marginBottom: 10 }}
        >
          <div>
            <Label htmlFor={fid + "date"}>{t("f.date")}</Label>
            <input
              id={fid + "date"}
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
              style={{ ...S.inp, marginBottom: 0 }}
            />
          </div>
          <div>
            <Label htmlFor={fid + "depth"}>{t("f.pitDepth")}</Label>
            <input
              id={fid + "depth"}
              type="text"
              inputMode="decimal"
              value={depth}
              placeholder={t("readings.depthPh")}
              onChange={(e) => setDepth(e.target.value)}
              style={{ ...S.inp, ...S.mono, marginBottom: 0 }}
            />
          </div>
          <div>
            <Label htmlFor={fid + "loc"}>{t("f.location")}</Label>
            <input
              id={fid + "loc"}
              type="text"
              value={loc}
              placeholder={t("readings.locationPh")}
              onChange={(e) => setLoc(e.target.value)}
              style={{ ...S.inp, marginBottom: 0 }}
            />
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          <div>
            <Label htmlFor={fid + "tech"}>{t("f.checkedBy")}</Label>
            <input
              id={fid + "tech"}
              type="text"
              value={tech}
              onChange={(e) => setTech(e.target.value)}
              style={{ ...S.inp, marginBottom: 0 }}
            />
          </div>
          <Button
            onClick={() => void add()}
            loading={busy}
            style={{ padding: "0 22px", whiteSpace: "nowrap" }}
          >
            {t("f.addReading")}
          </Button>
        </div>
      </div>
      )}

      {err && (
        <Notice tone="error" style={{ marginBottom: 10 }}>
          {err}
        </Notice>
      )}

      {rate !== null && (
        <div
          style={{
            background: DS.sur2,
            border: "2px solid " + tint(rateColor(rate), 31),
            borderRadius: 9,
            padding: "12px 16px",
            marginBottom: 12,
            display: "flex",
            gap: 20,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontSize: DS.fs.xs,
                color: DS.text3,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 2,
              }}
            >{t("f.pitRate")}</div>
            <div
              style={{
                fontSize: DS.fs.h1,
                fontWeight: 800,
                color: rateColor(rate),
                fontFamily: "monospace",
                lineHeight: 1,
              }}
            >
              {fmtNum(rate, lang, 3)}
              <span style={{ fontSize: DS.fs.md, marginLeft: 3, fontWeight: 400 }}>
                {t("unit.mmYr")}
              </span>
            </div>
          </div>
          <div
            style={{
              fontSize: DS.fs.md,
              fontWeight: 700,
              color: rateColor(rate),
            }}
          >
            {rate > RATE_CRITICAL_MM_YR
              ? t("rate.critical")
              : rate > RATE_ELEVATED_MM_YR
                ? t("rate.severe")
                : rate > 0
                  ? t("rate.moderate")
                  : t("rate.stable")}
          </div>
        </div>
      )}

      {rate === null && measured > 0 && (
        <div style={{ fontSize: DS.fs.md, color: DS.text3, marginBottom: 12 }}>
          {t("rate.insufficient")}
        </div>
      )}

      {!sorted.length && (
        <div
          style={{
            textAlign: "center",
            fontSize: DS.fs.md,
            color: DS.text3,
            padding: "12px 0",
          }}
        >{t("f.notRecorded")}</div>
      )}

      {sorted.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: DS.fs.md,
            }}
          >
            <thead>
              <tr style={{ borderBottom: "2px solid " + DS.bord }}>
                {[t("tbl.date"), t("tbl.depth"), t("tbl.change"), t("tbl.location"), t("tbl.inspector"), ""].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "6px 8px",
                        color: DS.text3,
                        fontSize: DS.fs.xs,
                        textTransform: "uppercase",
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const prev = i > 0 ? sorted[i - 1].depth_mm : null;
                const delta = prev !== null ? r.depth_mm - prev : null;
                const dClr =
                  delta === null
                    ? DS.text3
                    : delta > 0
                      ? DS.red
                      : delta < 0
                        ? DS.grn
                        : DS.text3;
                const dTxt =
                  delta === null
                    ? "-"
                    : (delta > 0 ? "+" : "") + fmtNum(delta, lang, 2);
                return (
                  <tr
                    key={r.id}
                    style={{ borderBottom: "1px solid " + tint(DS.bord, 60) }}
                  >
                    <td
                      style={{
                        padding: "7px 8px",
                        fontFamily: "monospace",
                        color: DS.text3,
                      }}
                    >
                      {fmt(r.reading_date, lang)}
                    </td>
                    <td
                      style={{
                        padding: "7px 8px",
                        fontFamily: "monospace",
                        color: DS.text,
                        fontWeight: 700,
                      }}
                    >
                      {fmtNum(r.depth_mm, lang)}
                    </td>
                    <td
                      style={{
                        padding: "7px 8px",
                        fontFamily: "monospace",
                        color: dClr,
                      }}
                    >
                      {dTxt}
                    </td>
                    <td style={{ padding: "7px 8px", color: DS.text3 }}>
                      {isAiEstimate(r) ? t("readings.aiLocation") : r.location || "-"}
                    </td>
                    <td style={{ padding: "7px 8px", color: DS.text3 }}>
                      {isAiEstimate(r) ? t("readings.aiBy") : r.checked_by || "-"}
                    </td>
                    <td style={{ padding: "7px 8px" }}>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => void remove(r.id)}
                          aria-label={t("readings.delete")}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "none",
                            border: "none",
                            color: DS.red,
                            cursor: "pointer",
                          }}
                        >
                          <Icon icon={X} size="md" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
