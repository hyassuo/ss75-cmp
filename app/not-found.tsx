import Link from "next/link";
import { DS } from "@/lib/design/tokens";
import { t } from "@/lib/i18n/dict";
import { serverLang } from "@/lib/i18n/serverLang";

export default async function NotFound() {
  const lang = (await serverLang()) ?? "en";
  return (
    <div
      style={{
        fontFamily: DS.sans,
        background: DS.bg,
        color: DS.text,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        margin: 0,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: DS.fs.display,
            fontWeight: 800,
            fontFamily: DS.mono,
            color: DS.blu,
          }}
        >
          404
        </div>
        <div style={{ fontSize: DS.fs.lg, color: DS.text3, margin: "8px 0 20px" }}>
          {t(lang, "nf.title")}
        </div>
        <Link
          href="/dashboard"
          style={{
            background: DS.blu,
            color: DS.onAccent,
            borderRadius: 8,
            padding: "10px 22px",
            fontWeight: 700,
            fontSize: DS.fs.base,
            textDecoration: "none",
          }}
        >
          {t(lang, "nf.back")}
        </Link>
      </div>
    </div>
  );
}
