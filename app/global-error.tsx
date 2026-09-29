"use client";

import { useEffect, useState } from "react";
import { t, type Lang } from "@/lib/i18n/dict";

// Replaces the root layout (and its LangProvider) when that layout itself
// fails, so the language is read from the cookie LangContext writes. After
// mount: the first render stays EN on server and client alike.
function cookieLang(): Lang {
  return /(?:^|;\s*)ss75-cmp\.lang=pt(?:;|$)/.test(document.cookie) ? "pt" : "en";
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => setLang(cookieLang()), []);
  return (
    <html lang={lang === "pt" ? "pt-BR" : "en"}>
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          background: "#2c3e52",
          color: "#c5d6e8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          margin: 0,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            {t(lang, "err.appTitle")}
          </div>
          <div
            style={{ fontSize: 13, color: "#9db5cc", marginBottom: 20 }}
          >
            {error.message || t(lang, "err.fatal")}
          </div>
          <button
            onClick={reset}
            style={{
              background: "#1a5cb5",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "10px 22px",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {t(lang, "common.reload")}
          </button>
        </div>
      </body>
    </html>
  );
}
