"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  EvidenceFileStore,
  showBlobInTab,
  type FileRef,
  type FileState,
} from "@/lib/utils/evidenceFiles";

const BUCKET = "evidence-photos";

// Authenticated download (the session's JWT in the Authorization header,
// storage RLS decides). no-store: the bytes stay out of the browser's
// HTTP cache too: they exist only in this tab's memory.
async function downloadEvidence(path: string, signal: AbortSignal): Promise<Blob> {
  const { data, error } = await createClient()
    .storage.from(BUCKET)
    .download(path, undefined, { signal, cache: "no-store" });
  if (error || !data) throw error ?? new Error("download failed");
  return data;
}

/**
 * Evidence files of the open item, as in-memory `blob:` URLs (see
 * lib/utils/evidenceFiles.ts). Revoked when a file leaves `files` and all
 * of them on unmount.
 */
export function useEvidenceFiles(files: FileRef[]) {
  const [state, setState] = useState<Record<string, FileState>>({});
  const storeRef = useRef<EvidenceFileStore | null>(null);

  // One store per mount (effects, not render: a StrictMode remount gets a
  // fresh store after the first one was disposed).
  useEffect(() => {
    const store = new EvidenceFileStore(downloadEvidence, setState);
    storeRef.current = store;
    return () => {
      store.dispose();
      storeRef.current = null;
      setState({});
    };
  }, []);

  // A string key: the list is rebuilt on every render, the files are not.
  const key = files.map((f) => `${f.eager ? 1 : 0}${f.path}`).join("\n");
  useEffect(() => {
    const refs = key
      ? key.split("\n").map((k) => ({ eager: k[0] === "1", path: k.slice(1) }))
      : [];
    storeRef.current?.sync(refs);
  }, [key]);

  const retry = useCallback((path: string) => {
    void storeRef.current?.load(path);
  }, []);

  // Opens the file in a new tab. The tab is opened now, inside the click
  // (popup blockers), and shown the bytes once they are in memory.
  const open = useCallback((path: string, loadingText: string) => {
    const store = storeRef.current;
    if (!store) return;
    const win = window.open("", "_blank");
    if (win) win.document.title = loadingText;
    if (win?.document.body) win.document.body.textContent = loadingText;
    void store.load(path).then((blob) => {
      if (!win || win.closed) return;
      if (blob) showBlobInTab(win, blob);
      // Failed or blocked: the panel says why (and offers a retry if any).
      else win.close();
    });
  }, []);

  return { files: state, retry, open };
}
