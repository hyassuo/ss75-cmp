"use client";

import { useEffect, useRef, useState } from "react";
import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { Spinner } from "@/components/ui/Spinner";
import { AIResultCard } from "@/components/items/AIResultCard";
import { fmt, today } from "@/lib/utils/format";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/utils/compressImage";
import { useLang } from "@/lib/context/LangContext";
import type { AIAnalysis, Evidence } from "@/lib/types/domain";

const BUCKET = "evidence-photos";
// Gemini on a VSAT link can be slow, but a spinner must never hang forever.
const AI_TIMEOUT_MS = 60_000;

type Outcome = { ok: true } | { ok: false; error: string };

interface Props {
  itemId: string;
  evidences: Evidence[];
  onAdd: (e: {
    evidence_date: string;
    description: string | null;
    file_path: string | null;
    file_name: string | null;
    file_type: string | null;
    file_size: number | null;
    ai_analysis: AIAnalysis | null;
  }) => Promise<Outcome>;
  onRemove: (id: string) => Promise<Outcome>;
  isAdmin: boolean;
  canEdit?: boolean;
  // force=false: fill-only-empty (auto-apply). force=true: overwrite
  // (the explicit Apply button on the result card).
  onAIApply: (r: AIAnalysis, force?: boolean) => void;
  // Reports whether the entry form holds an unsaved photo/description, so
  // the modal can warn before Save/Cancel discards it.
  onDirtyChange?: (dirty: boolean) => void;
}

export function EvidencePanel({
  itemId,
  evidences,
  onAdd,
  onRemove,
  isAdmin,
  canEdit = true,
  onAIApply,
  onDirtyChange,
}: Props) {
  const { t } = useLang();
  const [date, setDate] = useState(today());
  const [desc, setDesc] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [b64, setB64] = useState<string | null>(null);
  const [compressInfo, setCompressInfo] = useState("");
  const [mediaType, setMediaType] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AIAnalysis | null>(null);
  const [aiErr, setAiErr] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const [listErr, setListErr] = useState("");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onDirtyChange?.(!!file || !!desc.trim());
  }, [file, desc, onDirtyChange]);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    (async () => {
      // One round-trip for all photos instead of one per evidence.
      const withFile = evidences.filter((ev) => ev.file_path);
      const next: Record<string, string> = {};
      if (withFile.length) {
        const { data } = await supabase.storage
          .from(BUCKET)
          .createSignedUrls(
            withFile.map((ev) => ev.file_path as string),
            3600
          );
        const byPath = new Map(
          (data ?? []).map((d) => [d.path, d.signedUrl] as const)
        );
        for (const ev of withFile) {
          const url = byPath.get(ev.file_path as string);
          if (url) next[ev.id] = url;
        }
      }
      if (active) setUrls(next);
    })();
    return () => {
      active = false;
    };
  }, [evidences]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0];
    if (!raw) return;
    setCompressInfo("");
    // Compress phone-sized photos (5–8 MB) down to ~300–500 KB before any
    // upload / base64 conversion. PDFs and small images pass through.
    const { file: fl, compressed, originalBytes, finalBytes } =
      await compressImage(raw);
    setFile(fl);
    if (compressed) {
      setCompressInfo(
        `${t("f.optimised")} ${(originalBytes / 1024 / 1024).toFixed(1)} MB → ${(finalBytes / 1024).toFixed(0)} KB`
      );
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      if (fl.type.startsWith("image")) {
        setB64(result.split(",")[1]);
        setMediaType(fl.type);
      } else {
        setB64(null);
        setMediaType("");
      }
    };
    reader.readAsDataURL(fl);
  }

  async function runAI() {
    if (!b64) return;
    setAiLoading(true);
    setAiResult(null);
    setAiErr("");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
    try {
      const r = await fetch("/api/ai/analyze-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64: b64, mediaType: mediaType || "image/jpeg" }),
        signal: ctrl.signal,
      });
      const data = await r.json();
      if (!r.ok) {
        setAiErr(data.error || "AI analysis failed.");
      } else {
        const result = data as AIAnalysis;
        setAiResult(result);
        if (!desc && result.findings) {
          setDesc(`${result.findings} Action: ${result.immediateAction}.`);
        }
        // Auto-apply fills only fields the user hasn't set (force=false).
        // The card stays visible as a review surface; its Apply button
        // force-applies for deliberate overwrites.
        onAIApply(result, false);
      }
    } catch (e) {
      setAiErr(
        e instanceof DOMException && e.name === "AbortError"
          ? t("ai.timeout")
          : "AI analysis request failed."
      );
    } finally {
      clearTimeout(timer);
      setAiLoading(false);
    }
  }

  async function add() {
    if (!desc.trim() || uploading) return;
    setUploading(true);
    setSaveErr("");
    const supabase = createClient();
    let filePath: string | null = null;
    try {
      if (file) {
        const safeName = file.name.replace(/[^\w.\-]/g, "_");
        const path = `${itemId}/${crypto.randomUUID()}_${safeName}`;
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type });
        if (error) {
          // Abort instead of silently saving an evidence row with no file —
          // the form keeps its state so the user can retry.
          setSaveErr(t("f.uploadFailed") + " " + error.message);
          return;
        }
        filePath = path;
      }
      const res = await onAdd({
        evidence_date: date,
        description: desc,
        file_path: filePath,
        file_name: file?.name ?? null,
        file_type: file?.type ?? null,
        file_size: file?.size ?? null,
        ai_analysis: aiResult,
      });
      if (!res.ok) {
        // Keep the form for a retry; drop the blob we just uploaded
        // (best-effort — the retry uploads a fresh copy).
        if (filePath) await supabase.storage.from(BUCKET).remove([filePath]);
        setSaveErr(t("evidence.saveFailed") + " " + res.error);
        return;
      }
      setDate(today());
      setDesc("");
      setFile(null);
      setB64(null);
      setMediaType("");
      setCompressInfo("");
      setAiResult(null);
      setAiErr("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setSaveErr(
        t("evidence.saveFailed") + " " + (e instanceof Error ? e.message : String(e))
      );
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(t("evidence.confirmDelete"))) return;
    setListErr("");
    const res = await onRemove(id);
    if (!res.ok) setListErr(t("common.deleteFailed") + " " + res.error);
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
          style={{
            fontSize: 11,
            color: DS.vio,
            textTransform: "uppercase",
            letterSpacing: 1.5,
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          {t("f.addEvidenceTitle")}
        </div>

        {/* Step 1 — attach */}
        <div style={{ marginBottom: 12 }}>
          <Label>{t("f.step1")}</Label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf"
            onChange={handleFile}
            style={{ display: "none" }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            style={{
              ...S.inp,
              width: "100%",
              background: DS.sur,
              color: file ? DS.text : DS.text3,
              cursor: "pointer",
              textAlign: "left",
              fontWeight: file ? 600 : 400,
              fontSize: 12,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {file ? file.name : t("f.choose")}
          </button>
          {compressInfo && (
            <div style={{ fontSize: 10, color: DS.grn, marginTop: 6 }}>
              {compressInfo}
            </div>
          )}
        </div>

        {/* Step 2 — AI (only when a photo is loaded) */}
        {b64 && (
          <div style={{ marginBottom: 12 }}>
            <Label>{t("f.step2")}</Label>
            <button
              onClick={() => void runAI()}
              disabled={aiLoading}
              style={{
                width: "100%",
                background: aiLoading ? "transparent" : DS.vio,
                color: aiLoading ? DS.text3 : "#fff",
                border: "1px solid " + DS.vio,
                borderRadius: 7,
                padding: "10px 14px",
                fontWeight: 700,
                cursor: aiLoading ? "default" : "pointer",
                fontSize: 13,
                fontFamily: DS.sans,
                transition: DS.transition,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {aiLoading && <Spinner size={12} />}
              <span>{aiLoading ? t("f.analysing") : t("f.analyse")}</span>
            </button>
          </div>
        )}

        {/* Step 3 — date + description */}
        <div style={{ marginBottom: 12 }}>
          <Label>{t("f.step3")}</Label>
          <div style={{ marginBottom: 8 }}>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ ...S.inp, width: "100%" }}
            />
          </div>
          <Textarea
            label={t("f.findingDesc")}
            value={desc}
            onChange={setDesc}
            rows={2}
          />
        </div>

        {/* Step 4 — save */}
        <button
          onClick={() => void add()}
          disabled={uploading || !desc.trim()}
          style={{
            width: "100%",
            background: !desc.trim() ? DS.bord : DS.blu,
            color: !desc.trim() ? DS.text3 : "#fff",
            border: "none",
            borderRadius: 7,
            padding: "12px 18px",
            fontWeight: 700,
            cursor: uploading || !desc.trim() ? "default" : "pointer",
            fontSize: 14,
            opacity: uploading ? 0.6 : 1,
          }}
        >
          {uploading ? t("common.saving") : t("f.saveEvidence")}
        </button>
        {saveErr && (
          <div
            style={{
              background: DS.redBg,
              border: "1px solid " + DS.redBord,
              borderRadius: 8,
              padding: "10px 14px",
              marginTop: 10,
              fontSize: 12,
              color: DS.red,
            }}
          >
            {saveErr}
          </div>
        )}
      </div>
      )}

      {aiLoading && (
        <div
          style={{
            background: DS.bluBg,
            border: "1px solid " + DS.bluBord,
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 10,
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <Spinner size={16} color={DS.blu} />
          <span style={{ fontSize: 12, color: DS.blu, fontWeight: 600 }}>
            {t("f.aiAnalysing")}
          </span>
        </div>
      )}
      {aiErr && (
        <div
          style={{
            background: DS.redBg,
            border: "1px solid " + DS.redBord,
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 10,
            fontSize: 12,
            color: DS.red,
          }}
        >
          {aiErr}
        </div>
      )}
      {aiResult && (
        <AIResultCard
          result={aiResult}
          onApply={() => {
            onAIApply(aiResult, true);
            setAiResult(null);
          }}
        />
      )}

      {!evidences.length && (
        <div
          style={{
            textAlign: "center",
            fontSize: 12,
            color: DS.text3,
            padding: "12px 0",
          }}
        >{t("f.noEvidence")}</div>
      )}

      {listErr && (
        <div role="alert" style={{ color: DS.red, fontSize: 12, marginBottom: 8 }}>
          {listErr}
        </div>
      )}
      {evidences.map((ev) => (
        <div
          key={ev.id}
          style={{
            background: DS.sur2,
            border: "1px solid " + DS.bord,
            borderRadius: 8,
            padding: "11px 14px",
            marginBottom: 8,
            display: "flex",
            gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 5,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 11,
                  color: DS.blu,
                }}
              >
                {fmt(ev.evidence_date)}
              </span>
            </div>
            <div
              style={{ fontSize: 13, color: DS.text2, lineHeight: 1.7 }}
            >
              {ev.description}
            </div>
            {ev.file_name && (
              <div style={{ marginTop: 7 }}>
                {ev.file_type?.startsWith("image") && urls[ev.id] ? (
                  // Plain <img>: next/image would need a loader configured
                  // for Supabase signed URLs (which rotate every 1 h), and
                  // these are tiny thumbnails inside a modal — the cost of
                  // unoptimised loading is negligible here.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={urls[ev.id]}
                    alt={ev.file_name}
                    style={{
                      maxWidth: 120,
                      maxHeight: 70,
                      borderRadius: 5,
                      border: "1px solid " + DS.bord,
                      cursor: "pointer",
                    }}
                    onClick={() => window.open(urls[ev.id])}
                  />
                ) : urls[ev.id] ? (
                  <a
                    href={urls[ev.id]}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: 11,
                      color: DS.blu,
                      textDecoration: "none",
                    }}
                  >
                    Attachment: {ev.file_name}
                  </a>
                ) : (
                  <span style={{ fontSize: 11, color: DS.text3 }}>
                    {ev.file_name}
                  </span>
                )}
              </div>
            )}
          </div>
          {isAdmin && (
            <button
              onClick={() => void remove(ev.id)}
              style={{
                background: "none",
                border: "none",
                color: "rgba(192,57,43,0.5)",
                cursor: "pointer",
                fontSize: 16,
                padding: "0 4px",
                flexShrink: 0,
              }}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
