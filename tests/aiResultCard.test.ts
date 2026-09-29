import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AIResultCard } from "@/components/items/AIResultCard";
import { LangProvider } from "@/lib/context/LangContext";
import type { AIAnalysis } from "@/lib/types/domain";

const base: AIAnalysis = {
  corrosionType: "Unknown",
  componentName: "Unknown",
  probability: 2,
  consequence: 2,
  affectedAreaPct: 12.5,
  pitDepthEstMM: 0,
  immediateAction: "Monitor",
  findings: "f",
  recommendation: "r",
} as AIAnalysis;

const html = (r: AIAnalysis, lang: "en" | "pt") =>
  renderToStaticMarkup(
    createElement(
      LangProvider,
      { initialLang: lang } as { initialLang: "en" | "pt"; children: ReactNode },
      createElement(AIResultCard, { result: r, onApply: () => {} })
    )
  );

describe("AI result card", () => {
  it("the sanitizer's 'Unknown' component gets no row (no English in PT)", () => {
    const pt = html(base, "pt");
    expect(pt).not.toContain("Unknown");
    expect(pt).not.toContain("COMPONENTE");
    expect(pt).toContain("Não identificada");
    expect(pt).toContain("12,5");
    expect(html({ ...base, componentName: "Flange" }, "pt")).toContain("COMPONENTE");
  });
});
