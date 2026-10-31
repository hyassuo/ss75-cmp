"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";
import { Label } from "@/components/ui/Label";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/lib/context/LangContext";
import { checkRecoveryToken, jwtPayload } from "@/lib/security/recoveryToken";
import { writeLastActivity } from "@/lib/security/idle";

export const MIN_PASSWORD = 8;

type Phase = "checking" | "ready" | "invalid" | "otherUser" | "saving" | "done";

// Landing page of the reset email (sent by lib/supabase/recoveryMail.ts,
// implicit flow): #access_token=…&refresh_token=…&type=recovery. Only such a
// link opens the form: being signed in is not enough to change the
// password here. The tokens are read and stripped from the URL before the
// Supabase browser client is created (it is a singleton that inspects the
// URL when first constructed), so nothing else consumes them.
//
// The fragment is whatever the link says, so its tokens must prove they
// come from a reset link opened just now (checkRecoveryToken: the "amr"
// claim, before and after setSession), and they never replace another
// user's session on this device: an insider's own tokens, sent as a
// "reset link", would otherwise sign a colleague into the insider's
// account.
export function ResetPasswordForm() {
  const { t } = useLang();
  const [phase, setPhase] = useState<Phase>("checking");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const started = useRef(false);
  const pwId = useId();
  const pw2Id = useId();
  const errId = useId();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    // Tokens must not stay in the address bar or the history.
    window.history.replaceState(null, "", window.location.pathname);
    void (async () => {
      const supabase = createClient();
      const access = hash.get("access_token");
      const refresh = hash.get("refresh_token");
      const link = checkRecoveryToken(access, Date.now());
      if (hash.get("type") !== "recovery" || !access || !refresh || !link.ok) {
        setPhase("invalid");
        return;
      }
      // Someone else signed in here: refuse rather than switch accounts.
      const { data: current } = await supabase.auth.getSession();
      const currentUser = jwtPayload(current.session?.access_token)?.sub;
      if (currentUser && currentUser !== link.userId) {
        setPhase("otherUser");
        return;
      }
      const { data, error } = await supabase.auth.setSession({
        access_token: access,
        refresh_token: refresh,
      });
      // GoTrue has now verified the token (or refreshed it): check what it
      // actually accepted, and drop the session if that isn't the link's.
      const session = data.session;
      const accepted =
        !error &&
        !!session &&
        session.user.id === link.userId &&
        checkRecoveryToken(session.access_token, Date.now()).ok;
      if (!accepted && session) {
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      }
      setPhase(accepted ? "ready" : "invalid");
    })();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (phase !== "ready") return;
    if (pw.length < MIN_PASSWORD) {
      setErr(t("reset.tooShort"));
      return;
    }
    if (pw !== pw2) {
      setErr(t("reset.mismatch"));
      return;
    }
    setErr("");
    setPhase("saving");
    const { error } = await createClient().auth.updateUser({ password: pw });
    if (error) {
      setPhase("ready");
      setErr(
        error.code === "same_password"
          ? t("reset.same")
          : error.code === "weak_password"
            ? t("reset.weak")
            : /fetch|network|load failed/i.test(error.message)
              ? t("login.network")
              : error.message
      );
      return;
    }
    setPhase("done");
    // The idle clock (SessionGuards) starts now for this new session.
    const { data: after } = await createClient().auth.getSession();
    const uid = jwtPayload(after.session?.access_token)?.sub;
    if (typeof uid === "string") writeLastActivity(uid, Date.now());
    // Full load so the server layout picks up the session cookie.
    window.setTimeout(() => window.location.replace("/dashboard"), 1500);
  }

  const card = {
    background: DS.sur,
    borderRadius: 12,
    padding: "clamp(24px, 6vw, 40px) clamp(20px, 7vw, 44px)",
    width: "100%",
    maxWidth: 360,
    boxSizing: "border-box" as const,
    boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
    border: "1px solid " + DS.bord,
  };
  const inp = { ...S.inp, height: 44, maxHeight: 44, lineHeight: "42px", fontSize: DS.fs.lg };

  return (
    <main
      style={{
        height: "100dvh",
        overflowY: "auto",
        boxSizing: "border-box",
        padding: "5vh 16px 24px",
        background: DS.sbBg,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        fontFamily: DS.sans,
      }}
    >
      <form
        onSubmit={(e) => void save(e)}
        noValidate
        aria-describedby={err ? errId : undefined}
        style={card}
      >
        <h1
          style={{
            fontSize: DS.fs.h3,
            fontWeight: 800,
            color: DS.text,
            margin: "0 0 20px",
            textAlign: "center",
          }}
        >
          {t("reset.title")}
        </h1>

        {phase === "checking" && (
          <div role="status" style={{ display: "flex", justifyContent: "center", gap: 8, color: DS.text3, fontSize: DS.fs.base }}>
            <Spinner size={14} color={DS.text3} /> {t("reset.checking")}
          </div>
        )}

        {phase === "invalid" && (
          <div role="alert">
            <p style={{ fontSize: DS.fs.base, color: DS.text2, lineHeight: 1.6, margin: "0 0 16px" }}>
              {t("reset.invalid")}
            </p>
            <a href="/login" style={{ color: DS.blu, fontSize: DS.fs.base, fontWeight: 600 }}>
              {t("reset.backToLogin")}
            </a>
          </div>
        )}

        {phase === "otherUser" && (
          <div role="alert">
            <p style={{ fontSize: DS.fs.base, color: DS.text2, lineHeight: 1.6, margin: "0 0 16px" }}>
              {t("reset.otherUser")}
            </p>
            <a href="/dashboard" style={{ color: DS.blu, fontSize: DS.fs.base, fontWeight: 600 }}>
              {t("reset.backToApp")}
            </a>
          </div>
        )}

        {phase === "done" && (
          <p role="status" style={{ fontSize: DS.fs.base, color: DS.grn, fontWeight: 600, textAlign: "center" }}>
            {t("reset.done")}
          </p>
        )}

        {(phase === "ready" || phase === "saving") && (
          <>
            <div style={{ marginBottom: 14 }}>
              <Label htmlFor={pwId}>{t("reset.new")}</Label>
              <input
                id={pwId}
                name="new-password"
                type="password"
                autoComplete="new-password"
                autoFocus
                value={pw}
                onChange={(e) => {
                  setPw(e.target.value);
                  setErr("");
                }}
                style={inp}
              />
              <div style={{ fontSize: DS.fs.sm, color: DS.text3, marginTop: 4 }}>
                {t("reset.rule")}
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <Label htmlFor={pw2Id}>{t("reset.confirm")}</Label>
              <input
                id={pw2Id}
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                value={pw2}
                onChange={(e) => {
                  setPw2(e.target.value);
                  setErr("");
                }}
                style={inp}
              />
            </div>
            {err ? (
              <Notice
                tone="error"
                id={errId}
                style={{ marginBottom: 16, textAlign: "center" }}
              >
                {err}
              </Notice>
            ) : null}
            <Button type="submit" size="lg" fullWidth loading={phase === "saving"}>
              {t("reset.save")}
            </Button>
          </>
        )}
      </form>
    </main>
  );
}
