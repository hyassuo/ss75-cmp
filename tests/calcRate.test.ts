import { DS } from "@/lib/design/tokens";
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

  it("a spike in between does not lower the long-term rate", () => {
    const withOutlier = calcRate([
      makeReading({ reading_date: "2025-01-01", depth_mm: 1.0 }),
      makeReading({ id: "r-2", reading_date: "2025-07-01", depth_mm: 9.9 }),
      makeReading({ id: "r-3", reading_date: "2026-01-01", depth_mm: 2.0 }),
    ]);
    expect(withOutlier).toBeCloseTo(1.0, 5);
  });
});

describe("calcRate — comparable measurements only", () => {
  it("returns null when readings are less than 90 days apart", () => {
    const r = calcRate([
      makeReading({ reading_date: "2026-01-01", depth_mm: 1.0 }),
      makeReading({ id: "r-2", reading_date: "2026-03-01", depth_mm: 1.2 }),
    ]);
    expect(r).toBeNull();
  });

  it("accepts exactly 90 days", () => {
    const r = calcRate([
      makeReading({ reading_date: "2026-01-01", depth_mm: 1.0 }),
      makeReading({ id: "r-2", reading_date: "2026-04-01", depth_mm: 1.0 }),
    ]);
    expect(r).toBe(0);
  });

  it("never compares different measuring points", () => {
    const r = calcRate([
      makeReading({ reading_date: "2025-01-01", depth_mm: 0.2, location: "Leg A" }),
      makeReading({ id: "r-2", reading_date: "2026-01-01", depth_mm: 3.0, location: "Leg B" }),
    ]);
    expect(r).toBeNull(); // one reading per point
  });

  it("matches points case- and space-insensitively", () => {
    const r = calcRate([
      makeReading({ reading_date: "2025-01-01", depth_mm: 1.0, location: " Leg  A" }),
      makeReading({ id: "r-2", reading_date: "2026-01-01", depth_mm: 2.0, location: "leg a" }),
    ]);
    expect(r).toBeCloseTo(1.0, 5);
  });

  it("the item's rate is its worst point", () => {
    const r = calcRate([
      makeReading({ reading_date: "2025-01-01", depth_mm: 1.0, location: "A" }),
      makeReading({ id: "r-2", reading_date: "2026-01-01", depth_mm: 1.5, location: "A" }),
      makeReading({ id: "r-3", reading_date: "2025-01-01", depth_mm: 1.0, location: "B" }),
      makeReading({ id: "r-4", reading_date: "2026-01-01", depth_mm: 3.0, location: "B" }),
    ]);
    expect(r).toBeCloseTo(2.0, 5);
  });

  it("uses the short-term rate when corrosion speeds up", () => {
    // 0 → 0.1 mm in the first year, then 0.1 → 0.6 mm in the next 6 months.
    const r = calcRate([
      makeReading({ reading_date: "2024-01-01", depth_mm: 0.0 }),
      makeReading({ id: "r-2", reading_date: "2025-01-01", depth_mm: 0.1 }),
      makeReading({ id: "r-3", reading_date: "2025-07-02", depth_mm: 0.6 }),
    ]);
    expect(r).toBeCloseTo((0.5 / 182) * 365, 5); // short-term ≈ 1.0 mm/yr
  });

  it("ignores a recent reading too close to the previous one for the short-term rate", () => {
    const r = calcRate([
      makeReading({ reading_date: "2025-01-01", depth_mm: 1.0 }),
      makeReading({ id: "r-2", reading_date: "2025-12-20", depth_mm: 1.9 }),
      makeReading({ id: "r-3", reading_date: "2026-01-01", depth_mm: 2.0 }),
    ]);
    // 12 days between the last two: compared with 2025-01-01 only.
    expect(r).toBeCloseTo(1.0, 5);
  });
});

describe("rateColor", () => {
  it("bands: null / >0.5 / >0.2 / >0 / 0", () => {
    expect(rateColor(null)).toBe(DS.text3);
    expect(rateColor(0.6)).toBe(DS.red);
    expect(rateColor(0.3)).toBe(DS.ora);
    expect(rateColor(0.1)).toBe(DS.yel);
    expect(rateColor(0)).toBe(DS.grn);
  });
});

describe("calcRate ignores AI pit-depth estimates", () => {
  it("does not turn an AI guess into a corrosion rate", () => {
    const r = calcRate([
      makeReading({
        reading_date: "2026-01-01",
        depth_mm: 0.3,
        location: "AI estimate",
        checked_by: "AI Vision",
      }),
      makeReading({ id: "r-2", reading_date: "2026-06-30", depth_mm: 1.5 }),
    ]);
    expect(r).toBeNull(); // only one measured reading
  });

  it("uses the measured readings around an AI estimate", () => {
    const r = calcRate([
      makeReading({ reading_date: "2025-01-01", depth_mm: 1.0 }),
      makeReading({
        id: "r-ai",
        reading_date: "2025-06-01",
        depth_mm: 9.9,
        location: "AI estimate",
        checked_by: "AI Vision",
      }),
      makeReading({ id: "r-2", reading_date: "2026-01-01", depth_mm: 2.0 }),
    ]);
    expect(r).toBeCloseTo(1.0, 5);
  });
});
