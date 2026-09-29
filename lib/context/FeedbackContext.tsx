"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Modal } from "@/components/ui/Modal";
import { DS } from "@/lib/design/tokens";
import { useLang } from "@/lib/context/LangContext";

// App-wide user feedback:
//   confirm() — a styled, translated, accessible replacement for
//               window.confirm (which is unstyled, English-titled and
//               blocks the page); resolves to true / false.
//   toast()   — short, non-blocking success/info message, announced to
//               screen readers.

interface ConfirmOptions {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive action: the confirm button is red. */
  danger?: boolean;
}

interface Toast {
  id: number;
  message: string;
  tone: "ok" | "error";
}

interface FeedbackState {
  confirm: (opts: ConfirmOptions | string) => Promise<boolean>;
  toast: (message: string, tone?: Toast["tone"]) => void;
}

const FeedbackContext = createContext<FeedbackState | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const confirm = useCallback((opts: ConfirmOptions | string) => {
    // A second request while one is open answers the first with "no".
    resolver.current?.(false);
    setPending(typeof opts === "string" ? { message: opts } : opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const answer = useCallback((v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setPending(null);
  }, []);

  const toast = useCallback((message: string, tone: Toast["tone"] = "ok") => {
    const id = nextId.current++;
    setToasts((ts) => [...ts, { id, message, tone }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4000);
  }, []);

  // A pending question is answered "no" when the page navigates (Back on
  // a phone closes the item modal the question was about) or the provider
  // unmounts (idle sign-out) — never left open over a different screen or
  // awaited forever.
  useEffect(() => {
    if (!pending) return;
    const cancel = () => answer(false);
    window.addEventListener("popstate", cancel);
    return () => window.removeEventListener("popstate", cancel);
  }, [pending, answer]);
  useEffect(() => () => resolver.current?.(false), []);

  const value = useMemo(() => ({ confirm, toast }), [confirm, toast]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {pending && <ConfirmDialog opts={pending} onAnswer={answer} />}
      <div
        aria-live="polite"
        role="status"
        style={{
          position: "fixed",
          left: 16,
          right: 16,
          bottom: "calc(72px + env(safe-area-inset-bottom))",
          zIndex: 1200,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              background: t.tone === "ok" ? DS.grn : DS.red,
              color: DS.onAccent,
              borderRadius: 8,
              padding: "10px 16px",
              fontSize: DS.fs.base,
              fontWeight: 600,
              boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
              maxWidth: 480,
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}

function ConfirmDialog({
  opts,
  onAnswer,
}: {
  opts: ConfirmOptions;
  onAnswer: (v: boolean) => void;
}) {
  const { t } = useLang();
  const msgId = useId();
  const titleId = useId();
  // Escape means "no".
  return (
    <Modal
      size="compact"
      role="alertdialog"
      labelledBy={titleId}
      describedBy={msgId}
      onEscape={() => onAnswer(false)}
    >
      <h2 id={titleId} className="sr-only">
        {t("common.confirm")}
      </h2>
      <p
        id={msgId}
        style={{ fontSize: DS.fs.xl, color: DS.text, margin: "4px 0 20px", lineHeight: 1.5 }}
      >
        {opts.message}
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button
          type="button"
          data-autofocus
          onClick={() => onAnswer(false)}
          style={{
            background: "transparent",
            color: DS.text2,
            border: "1px solid " + DS.bord,
            borderRadius: 8,
            padding: "10px 20px",
            minHeight: 44,
            fontSize: DS.fs.lg,
            cursor: "pointer",
          }}
        >
          {opts.cancelLabel ?? t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={() => onAnswer(true)}
          style={{
            background: opts.danger ? DS.red : DS.blu,
            color: DS.onAccent,
            border: "none",
            borderRadius: 8,
            padding: "10px 20px",
            minHeight: 44,
            fontSize: DS.fs.lg,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {opts.confirmLabel ?? t("common.confirm")}
        </button>
      </div>
    </Modal>
  );
}

export function useFeedback(): FeedbackState {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used within FeedbackProvider");
  return ctx;
}
