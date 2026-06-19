"use client";

import { useState } from "react";
import * as XLSX from "@e965/xlsx";
import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";
import { Badge } from "@/components/ui/Badge";
import { useData } from "@/lib/context/DataContext";
import { fmtCompact, today, isOverdue, daysUntil } from "@/lib/utils/format";
import { calcRate, rateColor } from "@/lib/domain/calcRate";
import { createClient } from "@/lib/supabase/client";
import { PRIORITY_COLOR, STATUS_COLOR } from "@/lib/utils/constants";
import { useLang } from "@/lib/context/LangContext";
import type { HistoryEntry } from "@/lib/types/domain";
// PdfDocument + @react-pdf/renderer (~500 KB) are lazy-loaded inside
// exportPDF so the dashboard chunk stays light for users who never export.
import type { PdfItem, PdfPhoto } from "@/components/export/PdfDocument";

// Cap per item to keep PDF size sane (~250 KB per JPEG => 1 MB max per item).
const MAX_PHOTOS_PER_ITEM = 4;
// Hard ceiling on how many items can carry photos in one PDF. Without this a
// 5000-item export with photos would trigger 20 000 storage fetches and lock
// the browser tab for minutes. Items beyond the cap still appear in the PDF
// — they just render without thumbnails.
const MAX_ITEMS_WITH_PHOTOS = 50;
const PHOTO_SIGNED_URL_TTL = 60 * 10; // 10 min

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportTab() {
  const { t, tPriority, tStatus } = useLang();
  const { zones, itemsByZone } = useData();
  const [busy, setBusy] = useState<string | null>(null);
  const [includePhotos, setIncludePhotos] = useState(false);

  const flat = zones.flatMap((z) =>
    itemsByZone(z.zid).map((i) => ({
      ...i,
      zid: z.zid,
      zname: z.name,
      zsys: z.system,
    }))
  );

  function itemRows() {
    return flat.map((it) => {
      const rt = calcRate(it.readings);
      return {
        Zone: it.zid,
        "Zone Name": it.zname,
        System: it.zsys,
        Item: it.name,
        Mechanism: it.mechanism ?? "",
        Protection: it.protection ?? "",
        "IFS Object ID": it.ifs_obj_id ?? "",
        "IFS Object Desc": it.ifs_obj_desc ?? "",
        "IFS WO": it.ifs_wo ?? "",
        "IFS FL": it.ifs_fl ?? "",
        Probability: it.prob ?? "",
        Consequence: it.cons ?? "",
        RPN: it.prob && it.cons ? it.prob * it.cons : "",
        Priority: it.priority ?? "",
        Status: it.status,
        SECE: it.sece ? "YES" : "NO",
        Frequency: it.freq_insp ?? "",
        "Last Inspection": it.last_insp ?? "",
        "Next Inspection": it.next_insp ?? "",
        "Corrosion Rate (mm/yr)": rt !== null ? rt.toFixed(3) : "",
        Notes: it.notes ?? "",
      };
    });
  }

  function exportCSV() {
    const rows = itemRows();
    const headers = Object.keys(rows[0] ?? { Zone: "" });
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        headers.map((h) => esc((r as Record<string, unknown>)[h])).join(",")
      ),
    ].join("\n");
    download(
      new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }),
      `ss75-cmp_${today()}.csv`
    );
  }

  async function exportXLSX() {
    setBusy("xlsx");
    try {
      const supabase = createClient();
      const itemIds = flat.map((i) => i.id);
      let history: HistoryEntry[] = [];
      if (itemIds.length) {
        const { data, error } = await supabase
          .from("history")
          .select("*")
          .in("item_id", itemIds)
          .order("event_date", { ascending: false });
        if (error) throw new Error(`history fetch: ${error.message}`);
        history = (data as HistoryEntry[]) ?? [];
      }
      const nameById = new Map(flat.map((i) => [i.id, i]));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(itemRows()),
        "Items"
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          flat.flatMap((it) =>
            it.readings.map((r) => ({
              Zone: it.zid,
              Item: it.name,
              Date: r.reading_date,
              "Depth (mm)": r.depth_mm,
              Location: r.location ?? "",
              "Checked By": r.checked_by ?? "",
            }))
          )
        ),
        "Readings"
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          flat.flatMap((it) =>
            it.evidences.map((e) => ({
              Zone: it.zid,
              Item: it.name,
              Date: e.evidence_date,
              Description: e.description ?? "",
              File: e.file_name ?? "",
              "AI Type": e.ai_analysis?.corrosionType ?? "",
              "AI Prob": e.ai_analysis?.probability ?? "",
              "AI Cons": e.ai_analysis?.consequence ?? "",
            }))
          )
        ),
        "Evidences"
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          history.map((h) => ({
            Item: nameById.get(h.item_id)?.name ?? h.item_id,
            Date: h.event_date,
            Action: h.action,
            Field: h.field_changed ?? "",
            Previous: h.prev_value ?? "",
            New: h.new_value ?? "",
            Note: h.note ?? "",
            User: h.by_user_email ?? "",
          }))
        ),
        "History"
      );
      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      download(
        new Blob([out], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `ss75-cmp_${today()}.xlsx`
      );
    } catch (e) {
      // Surface the failure — was previously silent, so a thrown error left
      // the button stuck in "Generating..." with no signal to the user.
      const msg = e instanceof Error ? e.message : String(e);
      alert(`XLSX export failed:\n\n${msg}`);
    }
    setBusy(null);
  }

  async function loadPhotos(): Promise<Map<string, PdfPhoto[]>> {
    const result = new Map<string, PdfPhoto[]>();
    const itemIds = flat
      .map((i) => i.id)
      .filter(Boolean)
      .slice(0, MAX_ITEMS_WITH_PHOTOS);
    if (!itemIds.length) return result;

    const supabase = createClient();
    const { data: evs } = await supabase
      .from("evidences")
      .select("item_id, evidence_date, file_path, file_type")
      .in("item_id", itemIds)
      .like("file_type", "image/%")
      .not("file_path", "is", null)
      .order("evidence_date", { ascending: false });
    if (!evs) return result;

    type Row = {
      item_id: string;
      evidence_date: string;
      file_path: string | null;
      file_type: string | null;
    };
    const byItem = new Map<string, Row[]>();
    for (const e of evs as Row[]) {
      const arr = byItem.get(e.item_id) ?? [];
      if (arr.length < MAX_PHOTOS_PER_ITEM) arr.push(e);
      byItem.set(e.item_id, arr);
    }
    const allPaths: string[] = [];
    byItem.forEach((arr) =>
      arr.forEach((e) => e.file_path && allPaths.push(e.file_path))
    );
    if (!allPaths.length) return result;

    const { data: signed } = await supabase.storage
      .from("evidence-photos")
      .createSignedUrls(allPaths, PHOTO_SIGNED_URL_TTL);
    const urlByPath = new Map<string, string>();
    (signed ?? []).forEach((row) => {
      if (row.path && row.signedUrl) urlByPath.set(row.path, row.signedUrl);
    });

    await Promise.all(
      Array.from(byItem.entries()).map(async ([itemId, arr]) => {
        const photos: PdfPhoto[] = [];
        for (const e of arr) {
          if (!e.file_path) continue;
          const url = urlByPath.get(e.file_path);
          if (!url) continue;
          try {
            const r = await fetch(url);
            if (!r.ok) continue;
            const data = await r.blob();
            photos.push({ evidence_date: e.evidence_date, data });
          } catch {
            // skip individual failures rather than abort the whole PDF
          }
        }
        if (photos.length) result.set(itemId, photos);
      })
    );
    return result;
  }

  async function exportPDF() {
    setBusy("pdf");
    try {
      const items: PdfItem[] = flat.map((it) => {
        const rt = calcRate(it.readings);
        return {
          id: it.id,
          zid: it.zid,
          zname: it.zname,
          name: it.name,
          ifs: it.ifs_obj_id ?? "",
          priority: it.priority ?? "",
          status: it.status,
          sece: it.sece,
          last_insp: it.last_insp ? fmtCompact(it.last_insp) : "",
          next_insp: it.next_insp ? fmtCompact(it.next_insp) : "",
          rate: rt !== null ? rt.toFixed(3) : "",
        };
      });
      const photosByItem = includePhotos ? await loadPhotos() : undefined;
      // Lazy-load the PDF chunk only when an export actually runs — keeps
      // it out of the dashboard's first-load bundle.
      const [{ pdf }, { PdfDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/export/PdfDocument"),
      ]);
      const blob = await pdf(
        <PdfDocument
          generated={fmtCompact(today())}
          total={flat.length}
          sece={flat.filter((i) => i.sece).length}
          critical={flat.filter((i) => i.priority === "Critical").length}
          items={items}
          photosByItem={photosByItem}
        />
      ).toBlob();
      download(blob, `ss75-cmp_${today()}.pdf`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`${t("exp.pdfFail")}\n\n${msg}`);
    }
    setBusy(null);
  }

  const btn = (longLabel: string, shortLabel: string, onClick: () => void, key: string) => (
    <button
      onClick={onClick}
      disabled={busy !== null || !flat.length}
      className="exp-btn"
      style={{
        background: DS.blu,
        color: "#fff",
        border: "none",
        borderRadius: 8,
        padding: "10px 22px",
        fontWeight: 700,
        cursor: busy || !flat.length ? "default" : "pointer",
        fontSize: 13,
        opacity: busy || !flat.length ? 0.6 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {busy === key ? (
        t("common.generating")
      ) : (
        <>
          <span className="exp-btn-long">{longLabel}</span>
          <span className="exp-btn-short">{shortLabel}</span>
        </>
      )}
    </button>
  );

  return (
    <div>
      <div style={{ ...S.card, marginBottom: 14 }}>
        <div
          style={{
            fontSize: 11,
            color: DS.text3,
            textTransform: "uppercase",
            letterSpacing: 1.5,
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          {t("exp.title")} — {flat.length} {t("exp.itemsSuffix")}
        </div>
        <div style={{ fontSize: 12, color: DS.text3, marginBottom: 16 }}>
          {t("exp.format")}
        </div>
        <div className="exp-btn-row">
          {btn(t("exp.csv"), "CSV", exportCSV, "csv")}
          {btn(t("exp.xlsx"), "XLSX", () => void exportXLSX(), "xlsx")}
          {btn(t("exp.pdf"), "PDF", () => void exportPDF(), "pdf")}
        </div>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginTop: 12,
            fontSize: 12,
            color: DS.text2,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={includePhotos}
            onChange={(e) => setIncludePhotos(e.target.checked)}
            disabled={busy !== null}
            style={{ cursor: "pointer" }}
          />
          {t("exp.includePhotos")}
        </label>
      </div>

      <div style={S.card}>
        <div
          style={{
            fontSize: 11,
            color: DS.text3,
            textTransform: "uppercase",
            letterSpacing: 1.5,
            fontWeight: 700,
            marginBottom: 14,
          }}
        >{t("exp.summary")}</div>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ borderBottom: "2px solid " + DS.bord2 }}>
                {[
                  "Zone",
                  "Item",
                  "IFS Object",
                  "Priority",
                  "Status",
                  "SECE",
                  "Last",
                  "Next",
                  "WO",
                  "Rate",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "8px 10px",
                      color: DS.text3,
                      fontSize: 10,
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {flat.map((it) => {
                const rt = calcRate(it.readings);
                const dd = daysUntil(it.next_insp);
                const nextClr = isOverdue(it.next_insp)
                  ? DS.red
                  : dd !== null && dd <= 30
                    ? DS.ora
                    : it.next_insp
                      ? DS.text3
                      : DS.bord2;
                return (
                  <tr
                    key={it.id}
                    style={{ borderBottom: "1px solid #f1f5f9" }}
                  >
                    <td
                      style={{
                        padding: "8px 10px",
                        fontFamily: "monospace",
                        fontSize: 11,
                        color: DS.blu,
                      }}
                    >
                      {it.zid}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        color: DS.text,
                        fontWeight: 600,
                        maxWidth: 160,
                      }}
                    >
                      {it.name || "-"}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        fontFamily: "monospace",
                        fontSize: 10,
                        color: DS.grn,
                      }}
                    >
                      {it.ifs_obj_id || "-"}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      {it.priority ? (
                        <Badge
                          text={tPriority(it.priority)}
                          color={PRIORITY_COLOR[it.priority]}
                          sm
                        />
                      ) : (
                        "-"
                      )}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <Badge
                        text={tStatus(it.status)}
                        color={STATUS_COLOR[it.status] || DS.text3}
                        sm
                      />
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      {it.sece ? (
                        <Badge text="SECE" color={DS.red} sm />
                      ) : (
                        "-"
                      )}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        fontFamily: "monospace",
                        fontSize: 11,
                        color: it.last_insp ? DS.text3 : DS.bord2,
                      }}
                    >
                      {fmtCompact(it.last_insp)}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        fontFamily: "monospace",
                        fontSize: 11,
                        color: nextClr,
                      }}
                    >
                      {(isOverdue(it.next_insp) ? "! " : "") +
                        fmtCompact(it.next_insp)}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        fontFamily: "monospace",
                        fontSize: 10,
                        color: it.ifs_wo ? DS.grn : DS.bord2,
                      }}
                    >
                      {it.ifs_wo || "-"}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        fontFamily: "monospace",
                        fontSize: 11,
                        color: rateColor(rt),
                      }}
                    >
                      {rt !== null ? rt.toFixed(3) : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
