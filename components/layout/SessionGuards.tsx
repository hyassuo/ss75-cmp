"use client";

import { useEffect, useRef, useState } from "react";
import { DS } from "@/lib/design/tokens";
import { Button } from "@/components/ui/Button";
import { useLang } from "@/lib/context/LangContext";
import { useData } from "@/lib/context/DataContext";
import { createClient } from "@/lib/supabase/client";
import {
  ACTIVITY_PATH,
  ACTIVITY_PING_MS,
  IDLE_REASON,
  IDLE_TIMEOUT_MS,
  IDLE_EXPIRED_ERROR,
  IDLE_WARNING_MS,
  LAST_ACTIVITY_KEY,
  readLastActivity,
  writeLastActivity,
} from "@/lib/security/idle";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
const VERSION_KEY = "ss75-cmp.lastVersion";
// Local writes of the activity time are throttled to this (scroll and
// mouse events come in bursts).
const STORE_EVERY_MS = 5 * 1000;

async function forceSignOut(reload: boolean, reason?: string) {
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
    if (reload) window.location.replace(reason ? `/login?reason=${reason}` : "/login");
  }
}

/**
 * Signs the user out after IDLE_TIMEOUT_MS with no input (mouse, keyboard,
 * touch, scroll), in every tab of this browser.
 *
 * The clock is the user's last activity in localStorage
 * (lib/security/idle.ts), not the time this component mounted: closing the
 * tab and opening the app again sees the real idle time, and activity in
 * one tab keeps the others alive ("storage" events). Mobile browsers
 * freeze timers in background tabs, so the deadline is also checked
 * against the wall clock whenever the page becomes visible again (or
 * comes back from the back/forward cache): returning to the tab is not
 * "activity" and must not restart the count. While the user is active the
 * server hears about it at most once a minute (ACTIVITY_PATH), so its own
 * idle check (the proxy) agrees on long form-filling without navigation.
 * Unsaved item edits survive the sign-out in local storage (itemDraft).
 */
export function IdleLogout() {
  const { profile } = useData();
  const uid = profile.id;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [warning, setWarning] = useState(false);
  const { t } = useLang();

  useEffect(() => {
    const mountedAt = Date.now();
    // Last activity known to this tab; a stored one (another tab, an
    // earlier visit) wins when newer. Nothing stored (first visit, storage
    // off): count from now, as before.
    let last = readLastActivity(uid) ?? mountedAt;
    let lastStored = 0;
    // The page load that mounted this told the server already.
    let lastPing = mountedAt;
    let signingOut = false;

    const signOut = () => {
      if (signingOut) return;
      signingOut = true;
      void forceSignOut(true, IDLE_REASON);
    };
    const latest = () => Math.max(last, readLastActivity(uid) ?? 0);
    const arm = (ms: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warnRef.current) clearTimeout(warnRef.current);
      timerRef.current = setTimeout(check, ms);
      warnRef.current = setTimeout(
        () => setWarning(true),
        Math.max(0, ms - IDLE_WARNING_MS)
      );
    };
    // Deadline reached or page visible again: another tab may have seen
    // activity meanwhile.
    function check() {
      last = latest();
      const left = IDLE_TIMEOUT_MS - (Date.now() - last);
      if (left <= 0) signOut();
      else arm(left);
    }
    const ping = () => {
      void fetch(ACTIVITY_PATH, { method: "POST", keepalive: true })
        .then(async (r) => {
          // The server already ended this session for inactivity. Only
          // that answer signs out: a bare 401 can also be a transient
          // failure to verify the session (Supabase Auth unreachable, a
          // refresh racing this tab's own), and signing out on it would
          // revoke the session of someone who is working.
          if (r.status !== 401) return;
          const body = (await r.json().catch(() => null)) as { error?: unknown } | null;
          if (body?.error === IDLE_EXPIRED_ERROR) signOut();
        })
        .catch(() => {
          // offline: the next activity tries again
          lastPing = 0;
        });
    };
    const activity = () => {
      const now = Date.now();
      last = now;
      setWarning(false);
      arm(IDLE_TIMEOUT_MS);
      if (now - lastStored >= STORE_EVERY_MS) {
        lastStored = now;
        writeLastActivity(uid, now);
      }
      if (now - lastPing >= ACTIVITY_PING_MS) {
        lastPing = now;
        ping();
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) check();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === LAST_ACTIVITY_KEY) {
        setWarning(false);
        check();
      }
    };
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) =>
      window.addEventListener(e, activity, { passive: true })
    );
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onShow);
    window.addEventListener("storage", onStorage);
    // Not activity: mounting must not restart the clock.
    if (readLastActivity(uid) === null) writeLastActivity(uid, last);
    check();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warnRef.current) clearTimeout(warnRef.current);
      events.forEach((e) => window.removeEventListener(e, activity));
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onShow);
      window.removeEventListener("storage", onStorage);
    };
  }, [uid]);

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
