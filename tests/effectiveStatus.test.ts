import { describe, it, expect } from "vitest";
import { effectiveStatus } from "@/lib/domain/effectiveStatus";
import { makeItem } from "./helpers";

describe("effectiveStatus", () => {
  it("returns Overdue for a past next_insp when status is not Critical", () => {
    expect(effectiveStatus(makeItem({ status: "OK", next_insp: "2000-01-01" }))).toBe(
      "Overdue"
    );
    expect(
      effectiveStatus(makeItem({ status: "Attention", next_insp: "2000-01-01" }))
    ).toBe("Overdue");
  });

  it("Critical wins over Overdue", () => {
    expect(
      effectiveStatus(makeItem({ status: "Critical", next_insp: "2000-01-01" }))
    ).toBe("Critical");
  });

  it("passes the stored status through when not overdue", () => {
    expect(effectiveStatus(makeItem({ status: "Attention" }))).toBe("Attention");
    expect(effectiveStatus(makeItem({ status: "Pending", next_insp: null }))).toBe(
      "Pending"
    );
  });
});
