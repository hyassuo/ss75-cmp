"use client";

import { DS, tint } from "@/lib/design/tokens";
import type { AIAnalysis } from "@/lib/types/domain";
import { useLang } from "@/lib/context/LangContext";

interface Props {
  result: AIAnalysis;
  onApply: () => void;
}

export function AIResultCard({ result: r, onApply }: Props) {
  const { t } = useLang();
  const actClr =
    r.immediateAction === "Urgent Treatment Required"
      ? DS.red
      : r.immediateAction === "Treat Soon"
        ? DS.ora
        : r.immediateAction === "Inspect Closely"
          ? DS.yel
          : DS.grn;

  const tile = (border: string) => ({
    background: DS.sur,
    borderRadius: 7,
    padding: "8px 10px",
    border: "1px solid " + border,
  });
  const cap = {
    fontSize: 9,
    color: DS.text3,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginBottom: 2,
  };

  return (
    <div
      style={{
        background: DS.grnBg,
        border: "1px solid " + DS.grnBord,
        borderRadius: 10,
        padding: 14,
        marginTop: 10,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: DS.grn,
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 10,
        }}
      >
        AI Corrosion Analysis Result
      </div>
      {r.componentName && (
        <div
          style={{
            fontSize: 13,
            color: DS.text,
            marginBottom: 8,
          }}
        >
          <span style={{ color: DS.text3, fontSize: 10, marginRight: 6 }}>
            COMPONENT
          </span>
          <span style={{ fontWeight: 700 }}>{r.componentName}</span>
        </div>
      )}
      <div
        className="form-grid-4"
        style={{ marginBottom: 10 }}
      >
        <div style={tile(DS.bord)}>
          <div style={cap}>{t("ai.type")}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: DS.text }}>
            {r.corrosionType}
          </div>
        </div>
        <div style={tile(DS.bord)}>
          <div style={cap}>{t("ai.prob")}</div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: DS.text,
              fontFamily: "monospace",
            }}
          >
            {r.probability}
          </div>
        </div>
        <div style={tile(DS.bord)}>
          <div style={cap}>{t("ai.cons")}</div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: DS.text,
              fontFamily: "monospace",
            }}
          >
            {r.consequence}
          </div>
        </div>
        <div style={tile(tint(actClr, 31))}>
          <div style={cap}>{t("ai.action")}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: actClr }}>
            {r.immediateAction}
          </div>
        </div>
      </div>
      <div
        className="form-grid-2"
        style={{ marginBottom: 10 }}
      >
        <div style={tile(DS.bord)}>
          <div style={cap}>{t("ai.area")}</div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: DS.text,
              fontFamily: "monospace",
            }}
          >
            {r.affectedAreaPct}
            <span style={{ fontSize: 11, marginLeft: 2 }}>%</span>
          </div>
        </div>
        {r.pitDepthEstMM > 0 && (
          <div style={tile(DS.bord)}>
            <div style={cap}>{t("ai.pitDepth")}</div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: DS.ora,
                fontFamily: "monospace",
              }}
            >
              {r.pitDepthEstMM}
              <span style={{ fontSize: 11, marginLeft: 2 }}>mm</span>
            </div>
          </div>
        )}
      </div>
      <div
        style={{
          fontSize: 12,
          color: DS.text2,
          lineHeight: 1.6,
          marginBottom: 6,
        }}
      >
        {r.findings}
      </div>
      <div style={{ fontSize: 12, color: DS.blu, fontWeight: 600 }}>
        {r.recommendation}
      </div>
      {r.inspectionFrequency && (
        <div style={{ fontSize: 11, color: DS.text3, marginTop: 6 }}>
          <span style={{ fontWeight: 700 }}>Suggested frequency:</span>{" "}
          {r.inspectionFrequency}
        </div>
      )}
      <button
        onClick={onApply}
        style={{
          marginTop: 10,
          background: DS.blu,
          color: DS.onAccent,
          border: "none",
          borderRadius: 7,
          padding: "7px 16px",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Apply to Item Fields
      </button>
    </div>
  );
}
