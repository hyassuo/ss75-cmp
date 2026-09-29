"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";
import { Label } from "@/components/ui/Label";
import { Spinner } from "@/components/ui/Spinner";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/lib/context/LangContext";

export const MIN_PASSWORD = 8;

type Phase = "checking" | "ready" | "invalid" | "saving" | "done";

// Landing page of the reset email (sent by lib/supabase/recoveryMail.ts,
// implicit flow): #access_token=…&refresh_token=…&type=recovery. Only such a
// link opens the form — being signed in is not enough to change the
// password here. The tokens are read and stripped from the URL before the
// Supabase browser client is created (it is a singleton that inspects the
// URL when first constructed), so nothing else consumes them.
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
      let ok = false;
      if (hash.get("type") === "recovery" && access && refresh) {
        ok = !(await supabase.auth.setSession({
          access_token: access,
          refresh_token: refresh,
        })).error;
      }
      setPhase(ok ? "ready" : "invalid");
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
  const inp = { ...S.inp, height: 44, maxHeight: 44, lineHeight: "42px", fontSize: 14 };

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
            fontSize: 18,
            fontWeight: 800,
            color: DS.text,
            margin: "0 0 20px",
            textAlign: "center",
          }}
        >
          {t("reset.title")}
        </h1>

        {phase === "checking" && (
          <div role="status" style={{ display: "flex", justifyContent: "center", gap: 8, color: DS.text3, fontSize: 13 }}>
            <Spinner size={14} /> {t("reset.checking")}
          </div>
        )}

        {phase === "invalid" && (
          <div role="alert">
            <p style={{ fontSize: 13, color: DS.text2, lineHeight: 1.6, margin: "0 0 16px" }}>
              {t("reset.invalid")}
            </p>
            <a href="/login" style={{ color: DS.blu, fontSize: 13, fontWeight: 600 }}>
              {t("reset.backToLogin")}
            </a>
          </div>
        )}

        {phase === "done" && (
          <p role="status" style={{ fontSize: 13, color: DS.grn, fontWeight: 600, textAlign: "center" }}>
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
              <div style={{ fontSize: 11, color: DS.text3, marginTop: 4 }}>
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
              <div
                id={errId}
                role="alert"
                style={{
                  background: DS.redBg,
                  border: "1px solid " + DS.redBord,
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 12,
                  color: DS.red,
                  marginBottom: 16,
                  textAlign: "center",
                }}
              >
                {err}
              </div>
            ) : null}
            <button
              type="submit"
              disabled={phase === "saving"}
              style={{
                width: "100%",
                background: DS.blu,
                color: "#fff",
                border: "none",
                borderRadius: 7,
                padding: "11px 0",
                minHeight: 44,
                fontWeight: 700,
                cursor: phase === "saving" ? "default" : "pointer",
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {phase === "saving" ? <Spinner size={14} /> : null}
              {t("reset.save")}
            </button>
          </>
        )}
      </form>
    </main>
  );
}
