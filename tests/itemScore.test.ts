import { describe, it, expect } from "vitest";
import { itemScore, integrityColor, integrityLabel } from "@/lib/domain/itemScore";
import { makeItem, makeReading } from "./helpers";

describe("itemScore", () => {
  it("a healthy item scores 100", () => {
    expect(itemScore(makeItem())).toBe(100);
  });

  it("status penalties", () => {
    expect(itemScore(makeItem({ status: "Critical" }))).toBe(50);
    expect(itemScore(makeItem({ status: "Attention" }))).toBe(75);
    expect(itemScore(makeItem({ status: "Pending" }))).toBe(85);
  });

  it("missing schedule / inspection penalties", () => {
    expect(itemScore(makeItem({ next_insp: null }))).toBe(80);
    expect(itemScore(makeItem({ last_insp: null }))).toBe(90);
  });

  it("high corrosion rate (>0.5 mm/yr) penalty", () => {
    const item = makeItem({
      readings: [
        makeReading({ reading_date: "2025-01-01", depth_mm: 1.0 }),
        makeReading({ id: "r-2", reading_date: "2026-01-01", depth_mm: 2.0 }), // 1 mm/yr
      ],
    });
    expect(itemScore(item)).toBe(75);
  });

  it("an overdue item scores lower than the same item on schedule", () => {
    expect(itemScore(makeItem({ next_insp: "2000-01-01" }))).toBeLessThan(
      itemScore(makeItem())
    );
  });

  it("overdue is a single flat -40 on top of the status penalty", () => {
    expect(itemScore(makeItem({ status: "OK", next_insp: "2000-01-01" }))).toBe(60);
    expect(
      itemScore(makeItem({ status: "Attention", next_insp: "2000-01-01" }))
    ).toBe(35);
    expect(
      itemScore(makeItem({ status: "Pending", next_insp: "2000-01-01" }))
    ).toBe(45);
    expect(
      itemScore(makeItem({ status: "Critical", next_insp: "2000-01-01" }))
    ).toBe(10);
  });

  it("never goes below 0", () => {
    const worst = makeItem({
      status: "Critical",
      next_insp: null,
      last_insp: null,
      readings: [
        makeReading({ reading_date: "2025-01-01", depth_mm: 0 }),
        makeReading({ id: "r-2", reading_date: "2025-02-01", depth_mm: 5 }),
      ],
    });
    expect(itemScore(worst)).toBeGreaterThanOrEqual(0);
  });
});

describe("integrity bands", () => {
  it("label bands", () => {
    expect(integrityLabel(null)).toBe("N/A");
    expect(integrityLabel(85)).toBe("GOOD");
    expect(integrityLabel(65)).toBe("FAIR");
    expect(integrityLabel(45)).toBe("DEGRADED");
    expect(integrityLabel(20)).toBe("CRITICAL");
  });

  it("color bands align with labels", () => {
    expect(integrityColor(null)).toBe("#7a95b0");
    expect(integrityColor(85)).toBe("#1e7e45");
    expect(integrityColor(20)).toBe("#c0392b");
  });
});
