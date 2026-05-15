"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
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
            Application error
          </div>
          <div
            style={{ fontSize: 13, color: "#6a8faf", marginBottom: 20 }}
          >
            {error.message || "A fatal error occurred."}
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
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
