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
  const [date, setDate] = useState(today());
  const [desc, setDesc] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [b64, setB64] = useState<string | null>(null);
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

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const fl = e.target.files?.[0];
    if (!fl) return;
    setFile(fl);
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
        setAiResult(data as AIAnalysis);
        if (!desc && data.findings) {
          setDesc(`${data.findings} Action: ${data.immediateAction}.`);
        }
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
        <div style={{ marginBottom: 10 }}>
          <Label>Photo / Evidence</Label>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              onChange={handleFile}
              style={{
                ...S.inp,
                padding: "6px 10px",
                fontSize: 11,
                color: DS.text3,
                flex: 1,
              }}
            />
            <button
              onClick={() => void add()}
              disabled={uploading}
              style={{
                background: DS.blu,
                color: "#fff",
                border: "none",
                borderRadius: 7,
                padding: "9px 18px",
                fontWeight: 700,
                cursor: uploading ? "default" : "pointer",
                fontSize: 13,
                whiteSpace: "nowrap",
                flexShrink: 0,
                opacity: uploading ? 0.6 : 1,
              }}
            >
              {uploading ? "Saving…" : "+ Add"}
            </button>
          </div>
          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => void runAI()}
              disabled={!b64 || aiLoading}
              style={{
                background: b64 && !aiLoading ? DS.vio : "transparent",
                color: b64 && !aiLoading ? "#fff" : DS.text3,
                border:
                  "1px solid " + (b64 && !aiLoading ? DS.vio : DS.bord),
                borderRadius: 7,
                padding: "7px 16px",
                fontWeight: 700,
                cursor: b64 && !aiLoading ? "pointer" : "default",
                fontSize: 12,
                fontFamily: DS.sans,
                transition: DS.transition,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {aiLoading && <Spinner size={12} />}
              {aiLoading ? "Analysing..." : "🔍 Analyse with AI"}
            </button>
            <div style={{ fontSize: 10, color: DS.text3, marginTop: 4 }}>
              {b64
                ? "Image ready — click to run AI corrosion analysis."
                : "Upload an image to enable AI analysis."}
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          <div>
            <Label>Date</Label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ ...S.inp }}
            />
          </div>
        </div>
        <Textarea
          label="Finding / Description"
          value={desc}
          onChange={setDesc}
          rows={2}
        />
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
            AI is analysing the photo...
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
        >
          No evidence recorded yet
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
