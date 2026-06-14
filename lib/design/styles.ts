import type { CSSProperties } from "react";
import { DS } from "@/lib/design/tokens";

// Shared inline style atoms. Only the entries actually consumed across
// components live here — page/modal containers moved to globals.css class
// rules so they can carry responsive @media tweaks.
export const S: Record<string, CSSProperties> = {
  card: {
    background: DS.sur,
    border: "1px solid " + DS.bord,
    borderRadius: 8,
    padding: "16px 20px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    transition: DS.transition,
  },
  inp: {
    width: "100%",
    background: DS.sur2,
    border: "1px solid " + DS.bord,
    borderRadius: 6,
    color: DS.text,
    padding: "0 11px",
    fontSize: 12,
    boxSizing: "border-box",
    outline: "none",
    fontFamily: DS.sans,
    height: 36,
    minHeight: 36,
    maxHeight: 36,
    WebkitAppearance: "none",
    MozAppearance: "none",
    appearance: "none",
    lineHeight: "34px",
    display: "block",
  },
  mono: { fontFamily: DS.mono },
  lbl: {
    display: "block",
    fontSize: 10,
    color: DS.text3,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontWeight: 600,
    marginBottom: 4,
    fontFamily: DS.sans,
  },
};
