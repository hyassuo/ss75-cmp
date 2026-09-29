import { describe, it, expect } from "vitest";
import { sanitizeAnalysis } from "@/lib/ai/sanitize";

const valid = {
  corrosionType: "Pitting",
  componentName: "Flange",
  probability: 3,
  consequence: 4,
  affectedAreaPct: 15,
  pitDepthEstMM: 0.4,
  immediateAction: "Treat Soon",
  inspectionFrequency: "Quarterly",
  findings: "Pitting on the flange face.",
  recommendation: "Clean and recoat.",
};

describe("sanitizeAnalysis", () => {
  it("passes a schema-valid analysis through unchanged", () => {
    expect(sanitizeAnalysis(valid)).toEqual(valid);
  });

  it("rejects non-objects", () => {
    for (const raw of [null, undefined, "x", 42, true]) {
      expect(sanitizeAnalysis(raw)).toBeNull();
    }
  });

  it("rejects missing or out-of-range probability / consequence", () => {
    for (const bad of [
      { probability: undefined },
      { probability: 0 },
      { probability: 6 },
      { probability: "high" },
      { consequence: null },
      { consequence: -1 },
      { consequence: 5.6 }, // rounds to 6
    ]) {
      expect(sanitizeAnalysis({ ...valid, ...bad })).toBeNull();
    }
  });

  it("rounds numeric strings for probability / consequence", () => {
    const r = sanitizeAnalysis({ ...valid, probability: "2", consequence: 4.4 });
    expect(r?.probability).toBe(2);
    expect(r?.consequence).toBe(4);
  });

  it("clamps area and pit depth, zero for non-numbers", () => {
    expect(sanitizeAnalysis({ ...valid, affectedAreaPct: 250, pitDepthEstMM: -3 }))
      .toMatchObject({ affectedAreaPct: 100, pitDepthEstMM: 0 });
    expect(sanitizeAnalysis({ ...valid, affectedAreaPct: "lots", pitDepthEstMM: 9999 }))
      .toMatchObject({ affectedAreaPct: 0, pitDepthEstMM: 500 });
  });

  it("coerces off-list enums to safe fallbacks", () => {
    expect(
      sanitizeAnalysis({
        ...valid,
        corrosionType: "Rust",
        immediateAction: "Panic",
        inspectionFrequency: "Quarterly ",
      })
    ).toMatchObject({ corrosionType: "Unknown", immediateAction: "Monitor", inspectionFrequency: "" });
  });

  it("caps and type-checks the free-text fields", () => {
    const r = sanitizeAnalysis({
      ...valid,
      componentName: "x".repeat(500),
      findings: "f".repeat(5000),
      recommendation: { html: "<b>" },
    });
    expect((r?.componentName as string).length).toBe(120);
    expect((r?.findings as string).length).toBe(2000);
    expect(r?.recommendation).toBe("");
    expect(sanitizeAnalysis({ ...valid, componentName: 7 })?.componentName).toBe("Unknown");
  });

  it("drops fields that are not part of the schema", () => {
    const r = sanitizeAnalysis({ ...valid, priority: "Critical", __proto__x: 1 });
    expect(Object.keys(r ?? {}).sort()).toEqual(Object.keys(valid).sort());
  });
});
