"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
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
 * Compares the build version stored in localStorage against the current
 * package.json version (which is bumped on every commit/release). When
 * they differ — i.e. a new build is live — the session is invalidated so
 * users come back through /login with the fresh app shell.
 *
 * Skips on the very first visit (no previous value), since logging out a
 * user who just signed in would be hostile.
 */
export function DeployLogout() {
  useEffect(() => {
    try {
      const last = window.localStorage.getItem(VERSION_KEY);
      window.localStorage.setItem(VERSION_KEY, APP_VERSION);
      if (last && last !== APP_VERSION) {
        void forceSignOut(true);
      }
    } catch {
      // Storage disabled — silently skip; users will still re-login on the
      // next browser close because cookies are session-only.
    }
  }, []);

  return null;
}
