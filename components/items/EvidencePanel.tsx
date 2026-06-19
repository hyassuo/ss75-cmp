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
  }) => Promise<void> | void;
  onRemove: (id: string) => void;
  isAdmin: boolean;
  canEdit?: boolean;
  onAIApply: (r: AIAnalysis) => void;
}

export function EvidencePanel({
  itemId,
  evidences,
  onAdd,
  onRemove,
  isAdmin,
  canEdit = true,
  onAIApply,
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
  const [urls, setUrls] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    (async () => {
      const next: Record<string, string> = {};
      for (const ev of evidences) {
        if (ev.file_path) {
          const { data } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(ev.file_path, 3600);
          if (data?.signedUrl) next[ev.id] = data.signedUrl;
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
    try {
      const r = await fetch("/api/ai/analyze-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64: b64, mediaType: mediaType || "image/jpeg" }),
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
        // Auto-apply the analysis to the item form so the user doesn't have
        // to hunt for a second "Apply" button. The card stays visible as a
        // review surface; clicking Apply there re-applies (e.g. after the
        // user edited a field by mistake).
        onAIApply(result);
      }
    } catch {
      setAiErr("AI analysis request failed.");
    }
    setAiLoading(false);
  }

  async function add() {
    if (!desc.trim()) return;
    setUploading(true);
    let filePath: string | null = null;
    if (file) {
      const supabase = createClient();
      const safeName = file.name.replace(/[^\w.\-]/g, "_");
      const path = `${itemId}/${crypto.randomUUID()}_${safeName}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type });
      if (!error) filePath = path;
    }
    await onAdd({
      evidence_date: date,
      description: desc,
      file_path: filePath,
      file_name: file?.name ?? null,
      file_type: file?.type ?? null,
      file_size: file?.size ?? null,
      ai_analysis: aiResult,
    });
    setDate(today());
    setDesc("");
    setFile(null);
    setB64(null);
    setMediaType("");
    setCompressInfo("");
    setAiResult(null);
    setAiErr("");
    if (fileRef.current) fileRef.current.value = "";
    setUploading(false);
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
            onAIApply(aiResult);
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
              onClick={() => onRemove(ev.id)}
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
