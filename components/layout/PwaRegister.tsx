"use client";

import { useEffect } from "react";

// Registers the PWA service worker. Production only — the SW's asset cache
// fights HMR in dev. Registration failure is non-fatal: the app works
// exactly as before without it.
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline install page + asset cache simply unavailable */
    });
  }, []);
  return null;
}
