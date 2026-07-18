import { describe, it, expect } from "vitest";
import { calcPriority } from "@/lib/domain/calcPriority";

const FUTURE = "2999-01-01"; // no overdue / due-soon bonus
const PAST = "2000-01-01"; // overdue bonus (+5)

describe("calcPriority", () => {
  it("returns null when prob or cons is missing", () => {
    expect(calcPriority(null, 3, false, null)).toBeNull();
    expect(calcPriority(3, null, false, null)).toBeNull();
    expect(calcPriority(null, null, false, null)).toBeNull();
  });

  it("maps the weighted score to the documented tiers (<6 / 6-12 / 13-21 / >=22)", () => {
    expect(calcPriority(1, 1, false, FUTURE)).toBe("Low"); // 1
    expect(calcPriority(2, 3, false, FUTURE)).toBe("Medium"); // 6
    expect(calcPriority(3, 4, false, FUTURE)).toBe("Medium"); // 12
    expect(calcPriority(3, 5, false, FUTURE)).toBe("High"); // 15
    expect(calcPriority(5, 5, false, FUTURE)).toBe("Critical"); // 25
  });

  it("applies the SECE ×1.5 multiplier", () => {
    expect(calcPriority(3, 3, false, FUTURE)).toBe("Medium"); // 9
    expect(calcPriority(3, 3, true, FUTURE)).toBe("High"); // 13.5
  });

  it("adds +2 each for DROPS and structural flags", () => {
    expect(calcPriority(2, 2, false, FUTURE)).toBe("Low"); // 4
    expect(calcPriority(2, 2, false, FUTURE, true, true)).toBe("Medium"); // 8
  });

  it("adds +5 when the next inspection is overdue", () => {
    expect(calcPriority(3, 4, false, PAST)).toBe("High"); // 12 + 5 = 17
  });

  it("adds +2 when the next inspection is within 30 days", () => {
    const in10 = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
    expect(calcPriority(3, 4, false, in10)).toBe("High"); // 12 + 2 = 14
  });

  it("no schedule bonus when next inspection is far out or unset", () => {
    expect(calcPriority(3, 4, false, null)).toBe("Medium"); // 12
    const in100 = new Date(Date.now() + 100 * 864e5).toISOString().slice(0, 10);
    expect(calcPriority(3, 4, false, in100)).toBe("Medium"); // 12
  });
});
