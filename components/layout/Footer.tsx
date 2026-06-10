import { DS } from "@/lib/design/tokens";

export function Footer() {
  return (
    <div
      className="ft-bar"
      style={{
        background: DS.sbBg,
        borderTop: "1px solid " + DS.sbBord,
        flexShrink: 0,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div className="ft-standards" style={{ fontSize: 9, color: DS.sbTxt2 }}>
        NORSOK M-001/M-503 · DNV-RP-G101 · ISO 21457 · NACE MR0175 · API 2C ·
        DROPS HSE_7100.0_I
      </div>
      <div
        className="ft-rev"
        style={{ fontSize: 9, color: DS.sbTxt2, fontFamily: DS.mono }}
      >
        Rev.01 · Developed by Helcio Yassuo
      </div>
    </div>
  );
}
