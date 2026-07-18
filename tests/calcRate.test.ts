import { describe, it, expect } from "vitest";
import { calcRate, rateColor } from "@/lib/domain/calcRate";
import { makeReading } from "./helpers";

describe("calcRate", () => {
  it("returns null without at least two readings", () => {
    expect(calcRate(null)).toBeNull();
    expect(calcRate(undefined)).toBeNull();
    expect(calcRate([])).toBeNull();
    expect(calcRate([makeReading()])).toBeNull();
  });

  it("computes mm/yr from the first and last reading by date", () => {
    const r = calcRate([
      makeReading({ reading_date: "2025-01-01", depth_mm: 1.0 }),
      makeReading({ id: "r-2", reading_date: "2026-01-01", depth_mm: 2.0 }),
    ]);
    expect(r).toBeCloseTo(1.0, 5); // +1 mm over 365 days
  });

  it("sorts by date — input order does not matter", () => {
    const r = calcRate([
      makeReading({ id: "r-2", reading_date: "2026-01-01", depth_mm: 2.0 }),
      makeReading({ reading_date: "2025-01-01", depth_mm: 1.0 }),
    ]);
    expect(r).toBeCloseTo(1.0, 5);
  });

  it("returns null when both readings share a date (zero elapsed days)", () => {
    const r = calcRate([
      makeReading({ reading_date: "2026-01-01", depth_mm: 1.0 }),
      makeReading({ id: "r-2", reading_date: "2026-01-01", depth_mm: 2.0 }),
    ]);
    expect(r).toBeNull();
  });

  it("clamps a negative slope to 0 (characterization)", () => {
    const r = calcRate([
      makeReading({ reading_date: "2025-01-01", depth_mm: 2.0 }),
      makeReading({ id: "r-2", reading_date: "2026-01-01", depth_mm: 1.0 }),
    ]);
    expect(r).toBe(0);
  });

  it("uses only the endpoints — intermediate readings are ignored (characterization)", () => {
    const withOutlier = calcRate([
      makeReading({ reading_date: "2025-01-01", depth_mm: 1.0 }),
      makeReading({ id: "r-2", reading_date: "2025-07-01", depth_mm: 9.9 }),
      makeReading({ id: "r-3", reading_date: "2026-01-01", depth_mm: 2.0 }),
    ]);
    expect(withOutlier).toBeCloseTo(1.0, 5);
  });
});

describe("rateColor", () => {
  it("bands: null / >0.5 / >0.2 / >0 / 0", () => {
    expect(rateColor(null)).toBe("#7a95b0");
    expect(rateColor(0.6)).toBe("#c0392b");
    expect(rateColor(0.3)).toBe("#c0591b");
    expect(rateColor(0.1)).toBe("#a07c10");
    expect(rateColor(0)).toBe("#1e7e45");
  });
});
