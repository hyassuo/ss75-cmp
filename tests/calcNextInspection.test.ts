import { describe, it, expect } from "vitest";
import { calcNextInspection, FREQ_DAYS } from "@/lib/domain/calcNextInspection";

describe("calcNextInspection", () => {
  it("returns null when either input is missing", () => {
    expect(calcNextInspection(null, "Annual")).toBeNull();
    expect(calcNextInspection("2026-01-15", null)).toBeNull();
  });

  it("returns null for on-demand frequencies", () => {
    expect(calcNextInspection("2026-01-15", "Per operation")).toBeNull();
    expect(calcNextInspection("2026-01-15", "As required")).toBeNull();
  });

  it("adds the fixed day count for the frequency", () => {
    expect(calcNextInspection("2026-01-15", "Weekly")).toBe("2026-01-22");
    // Monthly is a fixed 30 days by design, not a calendar month.
    expect(calcNextInspection("2026-01-15", "Monthly")).toBe("2026-02-14");
    expect(calcNextInspection("2026-01-01", "Quarterly")).toBe("2026-04-02"); // 91 days
  });

  it("Annual is 365 fixed days — drifts one day across a leap year (characterization)", () => {
    expect(calcNextInspection("2024-02-28", "Annual")).toBe("2025-02-27");
  });

  it("FREQ_DAYS covers every frequency", () => {
    expect(FREQ_DAYS["Every 2.5 years"]).toBe(912);
    expect(FREQ_DAYS["Per operation"]).toBeNull();
  });
});
