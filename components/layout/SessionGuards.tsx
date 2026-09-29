"use client";

import { useEffect, useRef, useState } from "react";
import { DS } from "@/lib/design/tokens";
import { Button } from "@/components/ui/Button";
import { useLang } from "@/lib/context/LangContext";
import { createClient } from "@/lib/supabase/client";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
const VERSION_KEY = "ss75-cmp.lastVersion";
// Single-tab session that does not survive 30 min of zero interaction.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
// Heads-up shown this long before the idle sign-out.
const IDLE_WARNING_MS = 2 * 60 * 1000;

async function forceSignOut(reload: boolean) {
  try {
    const supabase = createClient();
    // Local scope: end this device's session only. The default ('global')
    // revoked every session of the user, so an idle desktop tab signed the
    // inspector out of the tablet in the middle of an inspection.
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // ignore: we're already tearing the session down
  }
  // Hard reload so any in-memory state is cleared (data context, modal
  // state, etc.) and the proxy redirects to /login on the next page.
  if (typeof window !== "undefined") {
    if (reload) window.location.replace("/login");
  }
}

/**
 * Signs the user out after IDLE_TIMEOUT_MS with no input. Activity events
 * (mouse, keyboard, touch, scroll) reset the timer.
 *
 * Mobile browsers freeze timers in background tabs, so the deadline is also
 * checked against the wall clock whenever the page becomes visible again:
 * returning to the tab is not "activity" and must not restart the count.
 * Unsaved item edits survive the sign-out in local storage (itemDraft).
 */
export function IdleLogout() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivity = useRef(Date.now());
  const [warning, setWarning] = useState(false);
  const { t } = useLang();

  useEffect(() => {
    const arm = (ms: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warnRef.current) clearTimeout(warnRef.current);
      timerRef.current = setTimeout(() => void forceSignOut(true), ms);
      warnRef.current = setTimeout(
        () => setWarning(true),
        Math.max(0, ms - IDLE_WARNING_MS)
      );
    };
    const activity = () => {
      lastActivity.current = Date.now();
      setWarning(false);
      arm(IDLE_TIMEOUT_MS);
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const left = IDLE_TIMEOUT_MS - (Date.now() - lastActivity.current);
      if (left <= 0) void forceSignOut(true);
      else arm(left);
    };
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) =>
      window.addEventListener(e, activity, { passive: true })
    );
    document.addEventListener("visibilitychange", onVisible);
    activity();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warnRef.current) clearTimeout(warnRef.current);
      events.forEach((e) => window.removeEventListener(e, activity));
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!warning) return null;
  // Any tap/key counts as activity and dismisses this; the button just
  // gives an explicit target. Sits above the item modal (z-index 1000).
  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 1100,
        maxWidth: 520,
        margin: "0 auto",
        background: DS.sbBg,
        color: "#fff",
        borderRadius: 10,
        padding: "12px 14px",
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
        boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
        fontSize: DS.fs.base,
      }}
    >
      <span style={{ flex: "1 1 220px" }}>{t("idle.warning")}</span>
      <Button size="lg" onClick={() => setWarning(false)}>
        {t("idle.stay")}
      </Button>
    </div>
  );
}

/**
 * Offline banner. The app keeps unsaved item edits locally (itemDraft) and
 * keeps forms open when a save fails; this tells the inspector why saves
 * are failing before they try.
 */
export function ConnectionBanner() {
  const [online, setOnline] = useState(true);
  const { t } = useLang();
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      document.body.classList.toggle("is-offline", !navigator.onLine);
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (online) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1100,
        background: DS.yel,
        color: DS.onAccent,
        textAlign: "center",
        fontSize: DS.fs.base,
        fontWeight: 600,
        padding: "6px 12px",
      }}
    >
      {t("net.offline")}
    </div>
  );
}

/**
 * Forces a re-login only when the app's MAJOR version changes.
 *
 * Patch and minor bumps (1.3.11 → 1.4.0) are silent. Routine feature and
 * fix deploys must not bounce a user who just signed in: that produced the
 * "log in, flash the dashboard, get kicked back to login" effect, because
 * DeployLogout mounts right after login and would see the stored version
 * differ from the freshly deployed one.
 *
 * Only a MAJOR bump (1.x → 2.0.0) forces a fresh login, reserved for
 * genuinely breaking releases (schema/contract changes) where starting
 * clean is the safe default.
 *
 * First-ever visit is exempt so newly-signed-in users aren't bounced.
 */
function major(v: string): string {
  return v.split(".")[0] ?? "0";
}

export function DeployLogout() {
  useEffect(() => {
    try {
      const last = window.localStorage.getItem(VERSION_KEY);
      window.localStorage.setItem(VERSION_KEY, APP_VERSION);
      if (last && major(last) !== major(APP_VERSION)) {
        void forceSignOut(true);
      }
    } catch {
      // Storage disabled: silently skip; users will still re-login on the
      // next browser close because cookies are session-only.
    }
  }, []);

  return null;
}
