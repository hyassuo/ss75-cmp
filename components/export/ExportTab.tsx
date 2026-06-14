"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";
import { Badge } from "@/components/ui/Badge";
import { useData } from "@/lib/context/DataContext";
import { fmt, today, isOverdue, daysUntil } from "@/lib/utils/format";
import { calcRate, rateColor } from "@/lib/domain/calcRate";
import { createClient } from "@/lib/supabase/client";
import { PRIORITY_COLOR, STATUS_COLOR } from "@/lib/utils/constants";
import type { HistoryEntry } from "@/lib/types/domain";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportTab() {
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
    const supabase = createClient();
    const itemIds = flat.map((i) => i.id);
    let history: HistoryEntry[] = [];
    if (itemIds.length) {
      const { data } = await supabase
        .from("history")
        .select("*")
        .in("item_id", itemIds)
        .order("event_date", { ascending: false });
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
            "AI Severity": e.ai_analysis?.severity ?? "",
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
    setBusy(null);
  }

  async function exportPDF() {
    setBusy("pdf");
    try {
      const payload = {
        generated: fmt(today()),
        total: flat.length,
        sece: flat.filter((i) => i.sece).length,
        critical: flat.filter((i) => i.priority === "Critical").length,
        includePhotos,
        items: flat.map((it) => {
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
            last_insp: it.last_insp ? fmt(it.last_insp) : "",
            next_insp: it.next_insp ? fmt(it.next_insp) : "",
            rate: rt !== null ? rt.toFixed(3) : "",
          };
        }),
      };
      const r = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        alert("PDF export failed.");
      } else {
        download(await r.blob(), `ss75-cmp_${today()}.pdf`);
      }
    } catch {
      alert("PDF export failed.");
    }
    setBusy(null);
  }

  const btn = (label: string, onClick: () => void, key: string) => (
    <button
      onClick={onClick}
      disabled={busy !== null || !flat.length}
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
      }}
    >
      {busy === key ? "Generating…" : label}
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
          Export — {flat.length} items
        </div>
        <div style={{ fontSize: 12, color: DS.text3, marginBottom: 16 }}>
          CSV (flat list) · XLSX (Items / Readings / Evidences / History) ·
          PDF (formatted report)
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {btn("Export CSV", exportCSV, "csv")}
          {btn("Export XLSX", () => void exportXLSX(), "xlsx")}
          {btn("Export PDF", () => void exportPDF(), "pdf")}
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
          Include evidence photos in PDF (up to 4 per item — larger file,
          slower to generate)
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
        >
          Summary Table
        </div>
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
                          text={it.priority}
                          color={PRIORITY_COLOR[it.priority]}
                          sm
                        />
                      ) : (
                        "-"
                      )}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <Badge
                        text={it.status}
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
                      {fmt(it.last_insp)}
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
                        fmt(it.next_insp)}
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
