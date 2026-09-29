import Link from "next/link";
import { DS } from "@/lib/design/tokens";

export default function NotFound() {
  return (
    <div
      style={{
        fontFamily: "var(--font-ibm-plex-sans), system-ui, sans-serif",
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
            fontSize: 48,
            fontWeight: 800,
            fontFamily: "var(--font-ibm-plex-mono), monospace",
            color: DS.blu,
          }}
        >
          404
        </div>
        <div style={{ fontSize: 14, color: DS.text3, margin: "8px 0 20px" }}>
          Page not found
        </div>
        <Link
          href="/dashboard"
          style={{
            background: DS.blu,
            color: DS.onAccent,
            borderRadius: 8,
            padding: "10px 22px",
            fontWeight: 700,
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
