import { describe, expect, it } from "vitest";
import { latestNameByRef } from "@/lib/utils/historyNames";

describe("latestNameByRef", () => {
  it("prefers the most recent real name over the draft's 'Untitled'", () => {
    const m = latestNameByRef([
      { item_ref: "a", item_name: "Untitled", event_date: "2026-01-01T00:00:00Z" },
      { item_ref: "a", item_name: "Flange F-9", event_date: "2026-01-02T00:00:00Z" },
      { item_ref: "a", item_name: "Flange F-9b", event_date: "2026-01-03T00:00:00Z" },
      { item_ref: "b", item_name: "Untitled", event_date: "2026-01-01T00:00:00Z" },
      { item_ref: null, item_name: "x", event_date: "2026-01-01T00:00:00Z" },
    ]);
    expect(m.get("a")).toBe("Flange F-9b");
    expect(m.has("b")).toBe(false);
    expect(m.size).toBe(1);
  });
});
