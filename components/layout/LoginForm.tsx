"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeNext } from "@/lib/utils/safeNext";
import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { useLang } from "@/lib/context/LangContext";

// supabase-js (~50 KB of compressed JS) is needed only to submit, so it is
// not part of the login page's initial download: it loads on submit, warmed
// up as soon as the form gets focus (typing the email is ample time).
const loadAuth = () =>
  Promise.all([
    import("@/lib/supabase/client"),
    import("@/lib/supabase/loadAppData"),
  ]);
const warmUpAuth = () => void loadAuth().catch(() => {});

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const { t, lang, setLang } = useLang();
  const emailId = useId();
  const pwId = useId();
  const errId = useId();

  async function forgot() {
    if (loading) return;
    setInfo("");
    if (!email.trim()) {
      setErr(t("login.forgotNeedEmail"));
      return;
    }
    setErr("");
    setLoading(true);
    // Sent by the server (implicit flow): the link then works in any
    // browser, e.g. opened from Mail while the app is installed on iOS.
    let status = 0;
    try {
      const r = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      status = r.status;
    } catch {
      status = 0;
    }
    setLoading(false);
    // Same answer whether or not the address exists (no account probing).
    if (status === 0) setErr(t("login.network"));
    else if (status === 429) setErr(t("login.forgotLimit"));
    else if (status === 400) setErr(t("login.forgotNeedEmail"));
    else setInfo(t("login.forgotSent"));
  }

  async function doLogin(e?: FormEvent) {
    e?.preventDefault();
    if (loading) return;
    if (!email.trim() || !password) {
      setErr(t("login.missing"));
      return;
    }
    setLoading(true);
    setErr("");
    let auth: Awaited<ReturnType<typeof loadAuth>>;
    try {
      auth = await loadAuth();
    } catch {
      setLoading(false);
      setErr(t("login.network"));
      return;
    }
    const [{ createClient }, { preloadAppData }] = auth;
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setLoading(false);
      // Supabase's message is English-only; the common case gets ours.
      setErr(
        /invalid login credentials/i.test(error.message)
          ? t("login.invalid")
          : error.code === "user_banned" || /banned/i.test(error.message)
            ? t("login.inactive")
          : /fetch|network|load failed/i.test(error.message)
            ? t("login.network")
            : error.message || t("login.invalid")
      );
      return;
    }
    // The app's data starts loading now, while the destination is still
    // being rendered on the server; DataProvider takes it over.
    preloadAppData(supabase, data.user.id);
    // The session cookies are written before signInWithPassword resolves,
    // so this navigation already renders as the signed-in user. (A
    // router.refresh() on top rendered the destination a second time: two
    // RSC requests, each with the whole auth + profile chain.)
    router.replace(safeNext(params.get("next")));
  }

  return (
    <main
      style={{
        // body has overflow:hidden (the app shell scrolls internally), so
        // the login page scrolls itself — landscape phones and the
        // on-screen keyboard can leave less than the card's height.
        height: "100dvh",
        overflowY: "auto",
        boxSizing: "border-box",
        padding: "5vh 16px 24px",
        background: DS.sbBg,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        // Anchored near the top so the iOS keyboard / password autofill
        // tray doesn't cover the Sign In button.
        fontFamily: DS.sans,
      }}
    >
      <form
        onSubmit={(e) => void doLogin(e)}
        onFocus={warmUpAuth}
        noValidate
        aria-describedby={err ? errId : undefined}
        style={{
          background: DS.sur,
          borderRadius: 12,
          padding: "clamp(24px, 6vw, 40px) clamp(20px, 7vw, 44px)",
          width: "100%",
          maxWidth: 360,
          boxSizing: "border-box",
          boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
          border: "1px solid " + DS.bord,
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div
            style={{
              fontSize: DS.fs.xs,
              color: DS.text3,
              textTransform: "uppercase",
              letterSpacing: 3,
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            SS-75 — Noble Courage
          </div>
          <h1
            style={{
              fontSize: DS.fs.h3,
              fontWeight: 800,
              color: DS.text,
              fontFamily: DS.mono,
              letterSpacing: -0.3,
              margin: "0 0 16px",
              lineHeight: 1.3,
            }}
          >
            {t("login.title1")}
            <br />
            {t("login.title2")}
          </h1>
          <div
            style={{
              width: 40,
              height: 3,
              background: DS.blu,
              borderRadius: 2,
              margin: "0 auto",
            }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <Label htmlFor={emailId}>{t("login.email")}</Label>
          <input
            id={emailId}
            name="email"
            type="email"
            required
            value={email}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            spellCheck={false}
            onChange={(e) => {
              setEmail(e.target.value);
              setErr("");
            }}
            placeholder={t("login.emailPh")}
            style={{ ...S.inp, height: 44, maxHeight: 44, lineHeight: "42px", fontSize: DS.fs.lg }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <Label htmlFor={pwId}>{t("login.password")}</Label>
          <input
            id={pwId}
            name="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setErr("");
            }}
            placeholder={t("login.passwordPh")}
            style={{ ...S.inp, height: 44, maxHeight: 44, lineHeight: "42px", fontSize: DS.fs.lg }}
          />
        </div>

        {err ? (
          <Notice tone="error" id={errId} style={NOTICE}>
            {err}
          </Notice>
        ) : null}

        {info ? (
          <Notice tone="success" style={NOTICE}>
            {info}
          </Notice>
        ) : null}

        <Button type="submit" size="lg" fullWidth loading={loading}>
          {loading ? t("login.signingIn") : t("login.signIn")}
        </Button>

        <div style={{ textAlign: "center", marginTop: 12 }}>
          <Button
            variant="ghost"
            onClick={() => void forgot()}
            disabled={loading}
            style={{ color: DS.blu, fontSize: DS.fs.md }}
          >
            {t("login.forgot")}
          </Button>
        </div>

        <div
          style={{
            marginTop: 20,
            fontSize: DS.fs.xs,
            color: DS.text3,
            textAlign: "center",
            lineHeight: 1.8,
          }}
        >
          {t("login.help")}
        </div>
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <Button
            variant="secondary"
            onClick={() => setLang(lang === "pt" ? "en" : "pt")}
            style={{ fontSize: DS.fs.md }}
          >
            {lang === "pt" ? "English" : "Português"}
          </Button>
        </div>
      </form>
    </main>
  );
}

const NOTICE: React.CSSProperties = { marginBottom: 16, textAlign: "center" };
