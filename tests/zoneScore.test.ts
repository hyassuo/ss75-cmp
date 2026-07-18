import { describe, it, expect } from "vitest";
import { zoneScore, priorityWeight } from "@/lib/domain/zoneScore";
import { itemScore } from "@/lib/domain/itemScore";
import { makeItem } from "./helpers";

describe("zoneScore", () => {
  it("returns null for an empty zone", () => {
    expect(zoneScore([])).toBeNull();
    expect(zoneScore(null as never)).toBeNull();
  });

  it("a single-item zone shows that item's score", () => {
    const item = makeItem({ status: "Attention" });
    expect(zoneScore([item])).toBe(itemScore(item));
  });

  it("weighted average of equal scores is that score, regardless of weights", () => {
    const a = makeItem({ priority: "Critical", sece: true });
    const b = makeItem({ id: "item-2", priority: "Low", sece: false });
    expect(itemScore(a)).toBe(itemScore(b)); // both healthy → 100
    expect(zoneScore([a, b])).toBe(100);
  });

  it("priorityWeight maps priorities and multiplies SECE by 1.5", () => {
    expect(priorityWeight({ priority: "Critical", sece: false })).toBeCloseTo(1.4);
    expect(priorityWeight({ priority: "High", sece: false })).toBeCloseTo(1.2);
    expect(priorityWeight({ priority: "Medium", sece: false })).toBeCloseTo(1.0);
    expect(priorityWeight({ priority: "Low", sece: false })).toBeCloseTo(0.8);
    expect(priorityWeight({ priority: null, sece: false })).toBeCloseTo(0.8);
    expect(priorityWeight({ priority: "Critical", sece: true })).toBeCloseTo(2.1);
  });

  it("higher-priority items pull the average harder", () => {
    // Critical-priority item scores 50, Low-priority item scores 100.
    // Weighted mean must sit below the unweighted mean (75) because the
    // low score carries the 1.4 weight.
    const bad = makeItem({ priority: "Critical", status: "Critical" });
    const good = makeItem({ id: "item-2", priority: "Low" });
    const sc = zoneScore([bad, good]);
    expect(sc).not.toBeNull();
    expect(sc as number).toBeLessThan(75);
  });
});
