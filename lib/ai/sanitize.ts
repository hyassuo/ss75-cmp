import { FREQUENCIES } from "@/lib/utils/constants";

// Enum values shared between the request schema sent to Gemini
// (app/api/ai/analyze-photo/route.ts) and the server-side sanitizer that
// re-validates its answer — single source of truth, no drift.
export const CORROSION_TYPES = [
  "Galvanic",
  "Atmospheric",
  "Pitting",
  "Crevice",
  "MIC",
  "Erosion-Corrosion",
  "Uniform",
  "Unknown",
];
export const ACTIONS = [
  "Monitor",
  "Inspect Closely",
  "Treat Soon",
  "Urgent Treatment Required",
];

// Gemini is *asked* for schema-compliant output via responseSchema, but
// nothing guarantees it honors the contract. Core risk inputs
// (probability/consequence) are rejected when invalid; descriptive fields
// are coerced to safe fallbacks.
export function sanitizeAnalysis(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "object" || raw === null) return null;
  const a = raw as Record<string, unknown>;
  const prob = Math.round(Number(a.probability));
  const cons = Math.round(Number(a.consequence));
  if (!Number.isFinite(prob) || prob < 1 || prob > 5) return null;
  if (!Number.isFinite(cons) || cons < 1 || cons > 5) return null;
  const num = (v: unknown, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0;
  };
  return {
    corrosionType: CORROSION_TYPES.includes(a.corrosionType as string)
      ? a.corrosionType
      : "Unknown",
    componentName:
      typeof a.componentName === "string"
        ? a.componentName.slice(0, 120)
        : "Unknown",
    probability: prob,
    consequence: cons,
    affectedAreaPct: num(a.affectedAreaPct, 0, 100),
    pitDepthEstMM: num(a.pitDepthEstMM, 0, 500),
    immediateAction: ACTIONS.includes(a.immediateAction as string)
      ? a.immediateAction
      : "Monitor",
    // Off-list frequency degrades to "no suggestion" — the client applies
    // it only when it matches the FREQUENCIES list.
    inspectionFrequency: (FREQUENCIES as readonly string[]).includes(
      a.inspectionFrequency as string
    )
      ? a.inspectionFrequency
      : "",
    findings: typeof a.findings === "string" ? a.findings.slice(0, 2000) : "",
    recommendation:
      typeof a.recommendation === "string"
        ? a.recommendation.slice(0, 2000)
        : "",
  };
}
