"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import pkg from "@/package.json";

const APP_VERSION = (pkg as { version: string }).version;
const VERSION_KEY = "ss75-cmp.lastVersion";
// Single-tab session that does not survive 30 min of zero interaction.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

async function forceSignOut(reload: boolean) {
  try {
    const supabase = createClient();
    await supabase.auth.signOut();
  } catch {
    // ignore — we're already tearing the session down
  }
  // Hard reload so any in-memory state is cleared (data context, modal
  // state, etc.) and the middleware redirects to /login on the next page.
  if (typeof window !== "undefined") {
    if (reload) window.location.replace("/login");
  }
}

/**
 * Signs the user out after IDLE_TIMEOUT_MS with no input. Activity events
 * (mouse, keyboard, touch, scroll) reset the timer.
 */
export function IdleLogout() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void forceSignOut(true), IDLE_TIMEOUT_MS);
    };
    const events = [
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "visibilitychange",
    ];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, []);

  return null;
}

/**
 * Forces a re-login when the app's MAJOR.MINOR version changes.
 *
 * Patch bumps (1.2.2 → 1.2.3) are silent — daily polish / bug-fix
 * deploys shouldn't bounce users to /login mid-session and produce the
 * "flash of dashboard then redirect" effect they were seeing.
 *
 * Minor or major bumps (1.2.x → 1.3.0, or 1.x → 2.0.0) do force a
 * fresh login, because those tend to ship schema/contract changes or
 * meaningful UI shifts where starting clean is the safe default.
 *
 * First-ever visit is exempt so newly-signed-in users aren't bounced.
 */
function majorMinor(v: string): string {
  const parts = v.split(".");
  return `${parts[0] ?? "0"}.${parts[1] ?? "0"}`;
}

export function DeployLogout() {
  useEffect(() => {
    try {
      const last = window.localStorage.getItem(VERSION_KEY);
      window.localStorage.setItem(VERSION_KEY, APP_VERSION);
      if (last && majorMinor(last) !== majorMinor(APP_VERSION)) {
        void forceSignOut(true);
      }
    } catch {
      // Storage disabled — silently skip; users will still re-login on the
      // next browser close because cookies are session-only.
    }
  }, []);

  return null;
}
