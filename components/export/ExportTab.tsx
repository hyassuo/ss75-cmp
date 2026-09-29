"use client";

import { useState } from "react";
import { S } from "@/lib/design/styles";
import { DS, tint } from "@/lib/design/tokens";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useData } from "@/lib/context/DataContext";
import { fmtCompact, fmtNum, today, isOverdue, daysUntil } from "@/lib/utils/format";
import { tOr } from "@/lib/i18n/dict";
import { calcRate, rateColor } from "@/lib/domain/calcRate";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { csvRow } from "@/lib/utils/csv";
import { latestNameByRef } from "@/lib/utils/historyNames";
import { historyNote } from "@/lib/utils/historyNote";
import { download } from "@/lib/utils/download";
import { PRIORITY_COLOR, STATUS_COLOR } from "@/lib/utils/constants";
import { useLang } from "@/lib/context/LangContext";
import type { HistoryEntry } from "@/lib/types/domain";
// PdfDocument + @react-pdf/renderer (~500 KB) are lazy-loaded inside
// exportPDF so the dashboard chunk stays light for users who never export.
import type { PdfItem, PdfPhoto } from "@/components/export/PdfDocument";
import { effectivePriority } from "@/lib/domain/calcPriority";
import { useFeedback } from "@/lib/context/FeedbackContext";
import { useShell } from "@/lib/context/ShellContext";

// Cap per item to keep PDF size sane (~250 KB per JPEG => 1 MB max per item).
const MAX_PHOTOS_PER_ITEM = 4;
// Hard ceiling on how many items can carry photos in one PDF. Without this a
// 5000-item export with photos would trigger 20 000 storage fetches and lock
// the browser tab for minutes. Items beyond the cap still appear in the PDF;
// they just render without thumbnails.
const MAX_ITEMS_WITH_PHOTOS = 50;

// Read a Blob into a base64 data URL.
function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Race a promise against a timeout. If the timeout wins, the original
// promise's resolution is discarded (no cancel: just abandoned).
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

// Re-encode any displayable image Blob to a JPEG data URL via canvas.
// @react-pdf only renders JPEG/PNG: evidence stored as HEIC (iPhone) or
// WebP would be silently dropped. Drawing through a canvas normalises the
// format and downscales to a PDF-thumbnail-friendly size. Falls back to
// the raw data URL if the browser can't decode the blob.
async function blobToJpegDataURL(blob: Blob): Promise<string> {
  const MAX = 700;
  try {
    const bitmap = await withTimeout(
      createImageBitmap(blob, { imageOrientation: "from-image" }),
      8000,
      "image decode"
    );
    let { width, height } = bitmap;
    if (width > MAX || height > MAX) {
      if (width >= height) {
        height = Math.round((height * MAX) / width);
        width = MAX;
      } else {
        width = Math.round((width * MAX) / height);
        height = MAX;
      }
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    // Couldn't decode (e.g. HEIC on a browser without support). Only
    // JPEG/PNG can be embedded raw; anything else would be SILENTLY
    // dropped by @react-pdf: throw so the caller counts it as failed.
    if (blob.type === "image/jpeg" || blob.type === "image/png") {
      return blobToDataURL(blob);
    }
    throw new Error(`undecodable image format: ${blob.type || "unknown"}`);
  }
}

// Load the finished PDF into a tab that was opened synchronously during the
// click (see exportPDF). window.open() after an await is treated as
// programmatic and gets popup-blocked: which is why the first click
// "did nothing". We open the tab up front, then point it at the blob URL
// once generation finishes. The URL is revoked after a minute so the tab
// has time to load it.
function showPdfInTab(win: Window | null, blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  if (win && !win.closed) {
    win.location.href = url;
  } else {
    // Tab was blocked/closed: fall back to a same-gesture download.
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function ExportTab() {
  const { lang, t, tPriority, tStatus, tDept } = useLang();
  // CSV and XLSX are data for other tools: fixed English headers, stored
  // values, ISO dates and decimal points in both languages. Only the CSV
  // separator follows the language: Excel in pt-BR expects ";" (the comma
  // is its decimal separator).
  const csvSep = lang === "pt" ? ";" : ",";
  const { toast } = useFeedback();
  const { zones: allZones, itemsByZone, subareas } = useData();
  // With a department picked in the top bar, the export says explicitly
  // whether it covers that department or everything: a PDF must never
  // look like a department report while holding all of them (or vice versa).
  const { sysFilter } = useShell();
  const [scope, setScope] = useState<"dept" | "all">("dept");
  const deptOnly = sysFilter !== "All" && scope === "dept";
  const zones = deptOnly
    ? allZones.filter((z) => z.system === sysFilter)
    : allZones;
  const scopeLabel = deptOnly ? tDept(sysFilter) : t("exp.scopeAll");
  const deptSlug = sysFilter.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const fileBase = `ss75-cmp_${deptOnly ? deptSlug + "_" : ""}${today()}`;
  const subareaName = new Map(subareas.map((s) => [s.id, s.name]));
  const [busy, setBusy] = useState<string | null>(null);
  // Default ON so a fresh user sees the expected, complete PDF (photos
  // are the most useful evidence in a CMP audit). Power users who want a
  // fast/light export can uncheck.
  const [includePhotos, setIncludePhotos] = useState(true);

  const flat = zones.flatMap((z) =>
    itemsByZone(z.zid).map((i) => ({
      ...i,
      zid: z.zid,
      zname: z.name,
      zsys: z.system,
    }))
  );
  // Archived policy: CSV/XLSX are the system-of-record dump and keep
  // archived rows (flagged via the Archived column); the PDF report and the
  // on-screen summary show only active items.
  const activeFlat = flat.filter((i) => !i.archived);

  function itemRows() {
    return flat.map((it) => {
      const rt = calcRate(it.readings);
      return {
        Zone: it.zid,
        "Zone Name": it.zname,
        System: it.zsys,
        "Sub-area": (it.subarea_id && subareaName.get(it.subarea_id)) || "",
        Item: it.name,
        Mechanism: it.mechanism ?? "",
        Protection: it.protection ?? "",
        "IFS Object ID": it.ifs_obj_id ?? "",
        "IFS Object Desc": it.ifs_obj_desc ?? "",
        "IFS WO": it.ifs_wo ?? "",
        "IFS FL": it.ifs_fl ?? "",
        "Line Accessory": it.is_accessory ? "YES" : "NO",
        "Accessory Type": it.accessory_type ?? "",
        Probability: it.prob ?? "",
        Consequence: it.cons ?? "",
        RPN: it.prob && it.cons ? it.prob * it.cons : "",
        "Corrosion Extent (%)": it.corr_extent_band ?? "",
        "Material Loss (%)": it.material_loss_band ?? "",
        Priority: effectivePriority(it) ?? "",
        Status: it.status,
        SECE: it.sece ? "YES" : "NO",
        Frequency: it.freq_insp ?? "",
        "Last Inspection": it.last_insp ?? "",
        "Next Inspection": it.next_insp ?? "",
        "Action Type": it.action_type ?? "",
        "Action Due": it.action_due ?? "",
        "Action Status": it.action_status ?? "",
        "Action Note": it.action_note ?? "",
        "Corrosion Rate (mm/yr)": rt !== null ? rt.toFixed(3) : "",
        Notes: it.notes ?? "",
        Archived: it.archived ? "YES" : "NO",
      };
    });
  }

  function exportCSV() {
    const rows = itemRows();
    const headers = Object.keys(rows[0] ?? { Zone: "" });
    const csv = [
      csvRow(headers, csvSep),
      ...rows.map((r) =>
        csvRow(headers.map((h) => (r as Record<string, unknown>)[h]), csvSep)
      ),
    ].join("\n");
    download(
      new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }),
      `${fileBase}.csv`
    );
  }

  async function exportXLSX() {
    setBusy("xlsx");
    try {
      const supabase = createClient();
      const itemIds = new Set(flat.map((i) => i.id));
      // The unit's whole audit trail (RLS scopes it to the unit), paged past
      // the 1000-row response cap, then narrowed to the exported items plus
      // deleted ones (item_id NULL) so deletions stay on the record. The
      // only export query with a network dependency: time it out so a
      // stalled request errors visibly instead of hanging the button on
      // "Generating…" forever.
      const res = await withTimeout(
        fetchAll<HistoryEntry>((from, to, withCount) =>
          supabase
            .from("history")
            .select("*", { count: withCount ? "exact" : undefined })
            .order("event_date", { ascending: false })
            .order("id")
            .range(from, to),
          { key: (h) => h.id }
        ),
        60_000,
        "history fetch"
      );
      if (res.error) throw new Error(`history fetch: ${res.error}`);
      // Deleted items' events (item_id NULL) carry no zone, so a
      // department export can't tell whose they are: whole-unit only.
      const history = res.data.filter((h) =>
        h.item_id === null ? !deptOnly : itemIds.has(h.item_id)
      );
      const nameById = new Map(flat.map((i) => [i.id, i]));
      const deletedNames = latestNameByRef(history);

      // SheetJS (~120 kB gz) loads only when someone exports, instead of
      // riding in every dashboard visit's first load.
      const XLSX = await import("@e965/xlsx");
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
            Item:
              (h.item_id ? nameById.get(h.item_id)?.name : undefined) ??
              (h.item_ref ? deletedNames.get(h.item_ref) : undefined) ??
              h.item_name ??
              h.item_ref ??
              "",
            Date: h.event_date,
            Action: h.action,
            Field: h.field_changed ?? "",
            Previous: h.prev_value ?? "",
            New: h.new_value ?? "",
            Note: historyNote(h.note),
            User: h.by_user_email ?? "",
          }))
        ),
        // SheetJS reserves the name "History" (Excel change-history sheet),
        // so the audit log tab is named "Change Log".
        "Change Log"
      );
      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      download(
        new Blob([out], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `${fileBase}.xlsx`
      );
    } catch (e) {
      // Surface the failure: was previously silent, so a thrown error left
      // the button stuck in "Generating..." with no signal to the user.
      const msg = e instanceof Error ? e.message : String(e);
      toast(`${t("exp.xlsxFail")} ${msg}`, "error");
    }
    setBusy(null);
  }

  type PhotoLoad = {
    photos: Map<string, PdfPhoto[]>;
    failed: number; // photos that errored / timed out / were undecodable
    skippedItems: number; // items WITH photos beyond MAX_ITEMS_WITH_PHOTOS
  };

  async function loadPhotos(
    onProgress: (loaded: number, total: number) => void
  ): Promise<PhotoLoad> {
    const result = new Map<string, PdfPhoto[]>();
    // Evidence metadata is already in memory: DataContext loads items with
    // their evidences in one go. Re-querying via supabase.from('evidences')
    // proved fragile (a single stalled request would freeze the export with
    // no recovery), so build the photo job list straight from memory. We
    // still hit storage for the actual bytes per photo.
    type Job = {
      itemId: string;
      evidence_date: string;
      file_path: string;
    };
    const hasImage = (it: (typeof flat)[number]) =>
      (it.evidences ?? []).some(
        (e) => !!e.file_path && (e.file_type ?? "").startsWith("image/")
      );
    // Spend the photo budget only on items that actually carry photos:
    // slicing `flat` blind meant items in later zones lost their photos
    // even when earlier items had none.
    const withImages = activeFlat.filter(hasImage);
    const itemsConsidered = withImages.slice(0, MAX_ITEMS_WITH_PHOTOS);
    const skippedItems = withImages.length - itemsConsidered.length;
    const jobs: Job[] = [];
    for (const it of itemsConsidered) {
      const imageEvs = (it.evidences ?? [])
        .filter(
          (e) =>
            !!e.file_path && (e.file_type ?? "").startsWith("image/")
        )
        .sort((a, b) => (a.evidence_date < b.evidence_date ? 1 : -1))
        .slice(0, MAX_PHOTOS_PER_ITEM);
      for (const e of imageEvs) {
        jobs.push({
          itemId: it.id,
          evidence_date: e.evidence_date,
          file_path: e.file_path as string,
        });
      }
    }
    const total = jobs.length;
    let loaded = 0;
    let failed = 0;
    onProgress(0, total);
    if (!total) return { photos: result, failed, skippedItems };

    const supabase = createClient();
    // Bounded concurrency: N parallel downloads. With per-job timeouts
    // a single hung blob can no longer freeze the entire export.
    const CONCURRENCY = 6;
    const PER_PHOTO_TIMEOUT_MS = 12_000;
    let next = 0;
    async function worker() {
      while (next < jobs.length) {
        const job = jobs[next++];
        try {
          // no-store: the photo must not stay in the browser's HTTP cache
          // (on disk, after sign-out): only the PDF takes it out (C7).
          const dl = Promise.resolve(
            supabase.storage
              .from("evidence-photos")
              .download(job.file_path, undefined, { cache: "no-store" })
          );
          const { data: blob, error } = await withTimeout(
            dl,
            PER_PHOTO_TIMEOUT_MS,
            "storage download"
          );
          if (!error && blob) {
            const data = await blobToJpegDataURL(blob);
            const arr = result.get(job.itemId) ?? [];
            arr.push({ evidence_date: job.evidence_date, data });
            result.set(job.itemId, arr);
          } else {
            failed += 1;
          }
        } catch {
          // Count individual failures (timeout, decode error) instead of
          // aborting the whole PDF: surfaced in the report note.
          failed += 1;
        }
        loaded += 1;
        onProgress(loaded, total);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, () => worker())
    );
    return { photos: result, failed, skippedItems };
  }

  async function exportPDF() {
    setBusy("pdf");
    // Open the tab NOW, inside the click gesture, so the popup blocker
    // allows it. It shows a live progress message while the PDF generates,
    // then we redirect it to the blob URL.
    const win = window.open("", "_blank");
    if (win) {
      // Force a light background + readable text: browsers tinted the
      // default about:blank black in dark mode, which made the placeholder
      // text invisible and looked like "the new tab is just black".
      win.document.write(
        `<!doctype html><html lang='${lang === "pt" ? "pt-BR" : "en"}'><head>` +
          "<meta name='color-scheme' content='light'>" +
          `<title>${t("exp.win.title")}</title></head>` +
          "<body style='margin:0;background:#ffffff;color:#1e2d3d;" +
          "font-family:system-ui,sans-serif;padding:32px;font-size:16px'>" +
          "<div style='font-weight:700;margin-bottom:8px'>" +
          `${t("exp.win.heading")}</div>` +
          `<div id='cmp-status' style='color:#445566'>${t("exp.win.preparing")}</div>` +
          "</body></html>"
      );
    }
    function status(msg: string) {
      if (!win || win.closed) return;
      const el = win.document.getElementById("cmp-status");
      if (el) el.textContent = msg;
    }
    try {
      const items: PdfItem[] = activeFlat.map((it) => {
        const rt = calcRate(it.readings);
        return {
          id: it.id,
          zid: it.zid,
          zname: it.zname,
          subarea: (it.subarea_id && subareaName.get(it.subarea_id)) || "",
          name: it.name,
          ifs: it.ifs_obj_id ?? "",
          priority: effectivePriority(it) ? tPriority(effectivePriority(it)) : "",
          status: tStatus(it.status),
          sece: it.sece,
          last_insp: it.last_insp ? fmtCompact(it.last_insp, lang) : "",
          next_insp: it.next_insp ? fmtCompact(it.next_insp, lang) : "",
          rate: rt !== null ? fmtNum(rt, lang, 3) : "",
          action: it.action_type
            ? t(
                "pdf.action",
                tOr(lang, `actionType.${it.action_type}`, it.action_type),
                tOr(
                  lang,
                  `actionStatus.${it.action_status || "Sem planejamento"}`,
                  it.action_status || "Sem planejamento"
                )
              ) +
              (it.action_due
                ? " · " + t("pdf.actionDue", fmtCompact(it.action_due, lang))
                : "")
            : "",
        };
      });
      let photoLoad: PhotoLoad | undefined;
      if (includePhotos) {
        status(t("exp.win.lookingUp"));
        photoLoad = await loadPhotos((loaded, total) =>
          status(
            total
              ? t("exp.win.loadingPhotos", loaded, total)
              : t("exp.win.noPhotos")
          )
        );
      }
      const photosByItem = photoLoad?.photos;
      status(t("exp.win.rendering"));
      // If the user asked for photos and image evidence exists but nothing
      // loaded, say so rather than silently shipping a photo-less PDF.
      // This distinguishes a load/format problem from "there simply are no
      // photos". (failed > 0 implies image evidence existed.)
      if (
        includePhotos &&
        photoLoad &&
        photoLoad.photos.size === 0 &&
        photoLoad.failed > 0
      ) {
        toast(t("exp.photosUnavailable"), "error");
      }
      // Lazy-load the PDF chunk only when an export actually runs: keeps
      // it out of the dashboard's first-load bundle.
      const [{ pdf }, { PdfDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/export/PdfDocument"),
      ]);
      const photoCount = photosByItem
        ? Array.from(photosByItem.values()).reduce((n, a) => n + a.length, 0)
        : 0;
      // Self-describing report: state in the PDF itself when photos were
      // dropped (load failures or the per-report cap): silent omission is
      // the one failure mode a compliance document can't afford.
      let note = "";
      if (includePhotos && photoLoad) {
        const parts = [t("pdf.photosEmbedded", photoCount)];
        if (photoLoad.failed > 0) {
          parts.push(t("pdf.photosFailed", photoLoad.failed));
        }
        if (photoLoad.skippedItems > 0) {
          parts.push(
            t("pdf.photosCapped", MAX_ITEMS_WITH_PHOTOS, photoLoad.skippedItems)
          );
        }
        note = t("pdf.photosNote", parts.join(" · "));
      }
      console.info(
        `[pdf] rendering ${items.length} items, ${photoCount} photos`
      );
      const blob = await pdf(
        <PdfDocument
          lang={lang}
          generated={fmtCompact(today(), lang)}
          total={activeFlat.length}
          sece={activeFlat.filter((i) => i.sece).length}
          critical={activeFlat.filter((i) => effectivePriority(i) === "Critical").length}
          items={items}
          photosByItem={photosByItem}
          note={note || undefined}
          scope={scopeLabel}
        />
      ).toBlob();
      console.info(`[pdf] rendered blob: ${blob.size} bytes`);
      if (blob.size < 500) {
        throw new Error(`PDF render produced an empty file (${blob.size} B)`);
      }
      status(
        t(
          "exp.win.ready",
          (blob.size / 1024).toFixed(0),
          photoCount,
          photoLoad?.failed ?? 0
        )
      );
      showPdfInTab(win, blob, `${fileBase}.pdf`);
    } catch (e) {
      if (win && !win.closed) win.close();
      const msg = e instanceof Error ? e.message : String(e);
      toast(`${t("exp.pdfFail")} ${msg}`, "error");
    }
    setBusy(null);
  }

  const btn = (longLabel: string, shortLabel: string, onClick: () => void, key: string) => (
    <Button
      size="lg"
      onClick={onClick}
      disabled={busy !== null || !flat.length}
      loading={busy === key}
      className="exp-btn"
      style={{ whiteSpace: "nowrap" }}
    >
      {busy === key ? (
        t("common.generating")
      ) : (
        <>
          <span className="exp-btn-long">{longLabel}</span>
          <span className="exp-btn-short">{shortLabel}</span>
        </>
      )}
    </Button>
  );

  return (
    <div>
      <div style={{ ...S.card, marginBottom: 14 }}>
        <div
          style={{
            fontSize: DS.fs.sm,
            color: DS.text3,
            textTransform: "uppercase",
            letterSpacing: 1.5,
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          {t("exp.title")} ({activeFlat.length} {t("exp.itemsSuffix")})
        </div>
        <div style={{ fontSize: DS.fs.md, color: DS.text3, marginBottom: 16 }}>
          {t("exp.format")}
        </div>
        {sysFilter !== "All" && (
          <fieldset
            style={{ border: "none", padding: 0, margin: "0 0 14px" }}
            disabled={busy !== null}
          >
            <legend style={{ fontSize: DS.fs.md, color: DS.text2, fontWeight: 600, marginBottom: 6 }}>
              {t("exp.scope")}
            </legend>
            {(["dept", "all"] as const).map((v) => (
              <label
                key={v}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  marginRight: 16,
                  minHeight: 36,
                  fontSize: DS.fs.base,
                  color: DS.text,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="exp-scope"
                  value={v}
                  checked={scope === v}
                  onChange={() => setScope(v)}
                />
                {v === "dept" ? t("exp.scopeDept", tDept(sysFilter)) : t("exp.scopeAll")}
              </label>
            ))}
          </fieldset>
        )}
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
            fontSize: DS.fs.md,
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
            fontSize: DS.fs.sm,
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
              fontSize: DS.fs.md,
            }}
          >
            <thead>
              <tr style={{ borderBottom: "2px solid " + DS.bord2 }}>
                {[
                  t("exp.col.zone"),
                  t("exp.col.item"),
                  t("exp.col.ifs"),
                  t("exp.col.priority"),
                  t("exp.col.status"),
                  t("exp.col.sece"),
                  t("exp.col.last"),
                  t("exp.col.next"),
                  t("exp.col.wo"),
                  t("exp.col.rate"),
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "8px 10px",
                      color: DS.text3,
                      fontSize: DS.fs.xs,
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
              {activeFlat.map((it) => {
                const rt = calcRate(it.readings);
                const dd = daysUntil(it.next_insp);
                const nextClr = isOverdue(it.next_insp)
                  ? DS.red
                  : dd !== null && dd <= 30
                    ? DS.ora
                    : it.next_insp
                      ? DS.text3
                      : DS.text3;
                return (
                  <tr
                    key={it.id}
                    style={{ borderBottom: "1px solid " + tint(DS.bord, 60) }}
                  >
                    <td
                      style={{
                        padding: "8px 10px",
                        fontFamily: "monospace",
                        fontSize: DS.fs.sm,
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
                        fontSize: DS.fs.xs,
                        color: DS.grn,
                      }}
                    >
                      {it.ifs_obj_id || "-"}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      {effectivePriority(it) ? (
                        <Badge
                          text={tPriority(effectivePriority(it))}
                          color={PRIORITY_COLOR[effectivePriority(it)!]}
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
                        fontSize: DS.fs.sm,
                        color: it.last_insp ? DS.text3 : DS.text3,
                      }}
                    >
                      {fmtCompact(it.last_insp, lang)}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        fontFamily: "monospace",
                        fontSize: DS.fs.sm,
                        color: nextClr,
                      }}
                    >
                      {(isOverdue(it.next_insp) ? "! " : "") +
                        fmtCompact(it.next_insp, lang)}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        fontFamily: "monospace",
                        fontSize: DS.fs.xs,
                        color: it.ifs_wo ? DS.grn : DS.text3,
                      }}
                    >
                      {it.ifs_wo || "-"}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        fontFamily: "monospace",
                        fontSize: DS.fs.sm,
                        color: rateColor(rt),
                      }}
                    >
                      {rt !== null ? fmtNum(rt, lang, 3) : "-"}
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
