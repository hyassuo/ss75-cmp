export default function ExportPage() {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #dde4ed",
        borderRadius: 8,
        padding: "48px 24px",
        textAlign: "center",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 12 }}>↗</div>
      <div
        style={{
          fontSize: 15,
          color: "#7a95b0",
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        Export
      </div>
      <div style={{ fontSize: 13, color: "#7a95b0" }}>
        CSV / XLSX / PDF export — coming in the next sprint.
      </div>
    </div>
  );
}
