import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        fontFamily: "var(--font-ibm-plex-sans), system-ui, sans-serif",
        background: "#f0f4f8",
        color: "#1e2d3d",
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
            color: "#1a5cb5",
          }}
        >
          404
        </div>
        <div style={{ fontSize: 14, color: "#7a95b0", margin: "8px 0 20px" }}>
          Page not found
        </div>
        <Link
          href="/dashboard"
          style={{
            background: "#1a5cb5",
            color: "#fff",
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
