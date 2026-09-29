"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImageIcon, ScanSearch, X } from "lucide-react";
import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";
import { Icon } from "@/components/ui/Icon";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { AIResultCard } from "@/components/items/AIResultCard";
import { fmt, today } from "@/lib/utils/format";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/utils/compressImage";
import { useLang } from "@/lib/context/LangContext";
import type { AIAnalysis, Evidence } from "@/lib/types/domain";
import { useFeedback } from "@/lib/context/FeedbackContext";
import { useEvidenceFiles } from "@/lib/hooks/useEvidenceFiles";
import type { FileState } from "@/lib/utils/evidenceFiles";

const BUCKET = "evidence-photos";
// Gemini on a VSAT link can be slow, but a spinner must never hang forever.
const AI_TIMEOUT_MS = 60_000;
// Photos picked in one go from the gallery. Each becomes its own evidence
// record (same date and description); kept small for satellite uploads.
const MAX_BATCH = 10;

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
  const { confirm, toast } = useFeedback();
  const [date, setDate] = useState(today());
  const [desc, setDesc] = useState("");
  // Queue of photos to save. The first is the one previewed and analysed by
  // AI; the rest (a multi-pick from the gallery) share its date and text.
  const [files, setFiles] = useState<File[]>([]);
  const file = files[0] ?? null;
  const [progress, setProgress] = useState("");
  // Photos of the current pick still being compressed (0 = none).
  const [preparing, setPreparing] = useState(0);
  const [b64, setB64] = useState<string | null>(null);
  const [compressInfo, setCompressInfo] = useState("");
  const [mediaType, setMediaType] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AIAnalysis | null>(null);
  const [aiErr, setAiErr] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const [listErr, setListErr] = useState("");
  // Thumbnails and attachments of this item, held in memory only (C7).
  const { files: stored, retry, open } = useEvidenceFiles(
    evidences
      .filter((ev) => ev.file_path)
      .map((ev) => ({
        path: ev.file_path as string,
        eager: !!ev.file_type?.startsWith("image"),
      }))
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  // Local preview of the picked photo (revoked when replaced/unmounted).
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file || !file.type.startsWith("image")) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Base64 of the head photo for the AI step, re-read whenever the head
  // changes (a new pick, or the queue moving on after a partial save) so
  // the analysis always describes the photo it will be saved with.
  useEffect(() => {
    setB64(null);
    setMediaType("");
    setAiResult(null);
    setAiErr("");
    if (!file || !file.type.startsWith("image")) return;
    const reader = new FileReader();
    reader.onload = () => {
      setB64((reader.result as string).split(",")[1]);
      setMediaType(file.type);
    };
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);

  useEffect(() => {
    onDirtyChange?.(!!file || !!desc.trim() || preparing > 0);
  }, [file, desc, preparing, onDirtyChange]);

  // Picking, the AI call and saving all work on the queue's head photo:
  // one at a time, so none of them acts on a photo that another replaced.
  const busy = preparing > 0 || uploading || aiLoading;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    // Cleared so that picking the same file(s) again still fires onChange.
    e.target.value = "";
    if (!picked.length) return;
    setCompressInfo("");
    setSaveErr("");
    const kept = picked.slice(0, MAX_BATCH);
    setPreparing(kept.length);
    // Compress phone-sized photos (5–8 MB) down to ~300–500 KB before any
    // upload / base64 conversion. PDFs and small images pass through.
    const out: File[] = [];
    let before = 0;
    let after = 0;
    let anyCompressed = false;
    try {
      for (const raw of kept) {
        const r = await compressImage(raw);
        out.push(r.file);
        before += r.originalBytes;
        after += r.finalBytes;
        anyCompressed ||= r.compressed;
      }
    } finally {
      setPreparing(0);
    }
    setFiles(out);
    if (anyCompressed) {
      setCompressInfo(
        `${t("f.optimised")} ${(before / 1024 / 1024).toFixed(1)} MB → ${(after / 1024).toFixed(0)} KB`
      );
    }
    if (picked.length > MAX_BATCH) setSaveErr(t("evidence.batchLimit", MAX_BATCH));
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

  // Uploads one photo (if any) and records the evidence row. On failure the
  // blob just uploaded is removed again — unless the insert did land and
  // only its response was lost on the link: then the blob is in use.
  async function saveOne(
    f: File | null,
    ai: AIAnalysis | null
  ): Promise<Outcome> {
    const supabase = createClient();
    let filePath: string | null = null;
    if (f) {
      const safeName = f.name.replace(/[^\w.\-]/g, "_");
      const path = `${itemId}/${crypto.randomUUID()}_${safeName}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, f, { contentType: f.type });
      // Abort instead of saving an evidence row with no file.
      if (error) return { ok: false, error: t("f.uploadFailed") + " " + error.message };
      filePath = path;
    }
    const res = await onAdd({
      evidence_date: date,
      description: desc,
      file_path: filePath,
      file_name: f?.name ?? null,
      file_type: f?.type ?? null,
      file_size: f?.size ?? null,
      ai_analysis: ai,
    });
    if (!res.ok) {
      if (filePath) {
        const { data: landed } = await supabase
          .from("evidences")
          .select("id")
          .eq("file_path", filePath)
          .limit(1);
        if (!landed?.length) {
          await supabase.storage.from(BUCKET).remove([filePath]);
        }
      }
      return { ok: false, error: t("evidence.saveFailed") + " " + res.error };
    }
    return { ok: true };
  }

  async function add() {
    if (!desc.trim() || busy) return;
    setUploading(true);
    setSaveErr("");
    // Saved one by one, dropping each from the queue as it lands: a failure
    // keeps the unsaved rest (and the form) for a retry.
    const queue: Array<File | null> = files.length ? [...files] : [null];
    const total = queue.length;
    let saved = 0;
    try {
      while (queue.length) {
        if (total > 1) setProgress(t("evidence.batchProgress", saved + 1, total));
        // Only the first (previewed) photo carries the AI analysis.
        const res = await saveOne(queue[0], saved === 0 ? aiResult : null);
        if (!res.ok) {
          // Say what did land, so nobody re-picks (and duplicates) those.
          setSaveErr(
            saved ? `${res.error} ${t("evidence.batchKept", saved, total)}` : res.error
          );
          return;
        }
        queue.shift();
        saved += 1;
        setFiles(queue.filter((f): f is File => f !== null));
      }
      toast(total > 1 ? t("toast.evidencesSaved", total) : t("toast.evidenceSaved"));
      setDate(today());
      setDesc("");
      setFiles([]);
      setCompressInfo("");
    } catch (e) {
      setSaveErr(
        t("evidence.saveFailed") + " " + (e instanceof Error ? e.message : String(e))
      );
    } finally {
      setProgress("");
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (
      !(await confirm({
        message: t("evidence.confirmDelete"),
        confirmLabel: t("common.delete"),
        danger: true,
      }))
    ) {
      return;
    }
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
            fontSize: DS.fs.sm,
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
          {/* capture="environment" opens the rear camera straight away on
              phones/tablets; the second input keeps gallery/PDF picking. */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
            tabIndex={-1}
            aria-hidden="true"
            style={{ display: "none" }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            onChange={handleFile}
            tabIndex={-1}
            aria-hidden="true"
            style={{ display: "none" }}
          />
          <div className="form-grid-2">
            <Button
              variant="accent"
              size="lg"
              onClick={() => cameraRef.current?.click()}
              disabled={busy}
            >
              <Icon icon={Camera} size="md" />
              {t("f.takePhoto")}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              <Icon icon={ImageIcon} size="md" />
              {t("f.fromGallery")}
            </Button>
          </div>
          {file && (
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                marginTop: 8,
                fontSize: DS.fs.md,
                color: DS.text,
                minWidth: 0,
              }}
            >
              {preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt={t("f.photoPreview")}
                  style={{
                    width: 72,
                    height: 54,
                    objectFit: "cover",
                    borderRadius: 6,
                    border: "1px solid " + DS.bord,
                    flexShrink: 0,
                  }}
                />
              )}
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontWeight: 600,
                }}
              >
                {file.name}
              </span>
              {files.length > 1 && (
                <span style={{ color: DS.text3, flexShrink: 0 }}>
                  {t("evidence.morePhotos", files.length - 1)}
                </span>
              )}
            </div>
          )}
          <div
            role="status"
            style={{ fontSize: DS.fs.sm, color: DS.text3, marginTop: preparing ? 6 : 0 }}
          >
            {preparing > 0 && t("evidence.preparing", preparing)}
          </div>
          {compressInfo && (
            <div style={{ fontSize: DS.fs.xs, color: DS.grn, marginTop: 6 }}>
              {compressInfo}
            </div>
          )}
        </div>

        {/* Step 2 — AI (only when a photo is loaded) */}
        {b64 && (
          <div style={{ marginBottom: 12 }}>
            <Label>{t("f.step2")}</Label>
            <Button
              variant="accent"
              size="lg"
              fullWidth
              onClick={() => void runAI()}
              disabled={busy}
              loading={aiLoading}
            >
              {!aiLoading && <Icon icon={ScanSearch} size="md" />}
              {aiLoading ? t("f.analysing") : t("f.analyse")}
            </Button>
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
        <Button
          size="lg"
          fullWidth
          onClick={() => void add()}
          disabled={busy || !desc.trim()}
          loading={uploading}
        >
          {uploading
            ? progress || t("common.saving")
            : files.length > 1
              ? t("evidence.saveMany", files.length)
              : t("f.saveEvidence")}
        </Button>
        {/* The label change above is not announced; this is. */}
        <div role="status" className="sr-only">
          {progress}
        </div>
        {saveErr && (
          <Notice tone="error" style={{ marginTop: 10 }}>
            {saveErr}
          </Notice>
        )}
      </div>
      )}

      {aiLoading && (
        <Notice
          tone="info"
          role={null}
          style={{
            marginBottom: 10,
            display: "flex",
            gap: 10,
            alignItems: "center",
            fontWeight: 600,
          }}
        >
          <Spinner size={16} color={DS.blu} />
          {t("f.aiAnalysing")}
        </Notice>
      )}
      {aiErr && (
        <Notice tone="error" role={null} style={{ marginBottom: 10 }}>
          {aiErr}
        </Notice>
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
            fontSize: DS.fs.md,
            color: DS.text3,
            padding: "12px 0",
          }}
        >{t("f.noEvidence")}</div>
      )}

      {listErr && (
        <Notice tone="error" style={{ marginBottom: 8 }}>
          {listErr}
        </Notice>
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
                  fontSize: DS.fs.sm,
                  color: DS.blu,
                }}
              >
                {fmt(ev.evidence_date)}
              </span>
            </div>
            <div
              style={{ fontSize: DS.fs.base, color: DS.text2, lineHeight: 1.7 }}
            >
              {ev.description}
            </div>
            {ev.file_name && (
              <div style={{ marginTop: 7 }}>
                {ev.file_path ? (
                  <EvidenceFile
                    name={ev.file_name}
                    image={!!ev.file_type?.startsWith("image")}
                    state={stored[ev.file_path]}
                    onOpen={() => open(ev.file_path as string, t("evidence.opening"))}
                    onRetry={() => retry(ev.file_path as string)}
                  />
                ) : (
                  <span style={{ fontSize: DS.fs.sm, color: DS.text3 }}>
                    {ev.file_name}
                  </span>
                )}
              </div>
            )}
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => void remove(ev.id)}
              aria-label={t("evidence.delete")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "none",
                border: "none",
                color: DS.red,
                cursor: "pointer",
                padding: "0 4px",
                flexShrink: 0,
              }}
            >
              <Icon icon={X} size="md" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// One evidence file: a thumbnail (photos) or a link (other attachments),
// both backed by an in-memory blob: URL; a placeholder while it downloads
// and, when it fails (offline, storage error), a message and a retry for
// that file alone.
function EvidenceFile({
  name,
  image,
  state,
  onOpen,
  onRetry,
}: {
  name: string;
  image: boolean;
  state: FileState | undefined;
  onOpen: () => void;
  onRetry: () => void;
}) {
  const { t } = useLang();
  // Never shown nor opened (see viewableBlob); retrying can't change that.
  if (state?.status === "blocked") {
    return (
      <div role="status" style={{ fontSize: DS.fs.sm, color: DS.red }}>
        {t("evidence.fileBlocked", name)}
      </div>
    );
  }
  if (state?.status === "error") {
    return (
      <div
        role="status"
        style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
      >
        <span style={{ fontSize: DS.fs.sm, color: DS.red }}>
          {t(image ? "evidence.photoFailed" : "evidence.fileFailed", name)}
        </span>
        {/* Named after its file: several failed photos each have one. */}
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          aria-label={`${t("common.tryAgain")}: ${name}`}
        >
          {t("common.tryAgain")}
        </Button>
      </div>
    );
  }
  if (image) {
    if (state?.status !== "ready") {
      return (
        <div
          role="status"
          aria-label={t("evidence.photoLoading", name)}
          style={{
            width: 120,
            height: 70,
            borderRadius: 5,
            border: "1px solid " + DS.bord,
            background: DS.sur,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Spinner size={16} color={DS.text3} />
        </div>
      );
    }
    return (
      // Plain <img>: a blob: URL needs no optimisation, and next/image
      // can't take one anyway.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={state.url}
        alt={name}
        role="button"
        tabIndex={0}
        title={t("evidence.openPhoto")}
        style={{
          maxWidth: 120,
          maxHeight: 70,
          borderRadius: 5,
          border: "1px solid " + DS.bord,
          cursor: "pointer",
        }}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
      />
    );
  }
  // Attachments download on the first open only (PDFs can be large).
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        fontSize: DS.fs.sm,
        color: DS.blu,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        textAlign: "left",
      }}
    >
      {t("evidence.attachment", name)}
      {state?.status === "loading" && <Spinner size={12} color={DS.blu} />}
    </button>
  );
}
