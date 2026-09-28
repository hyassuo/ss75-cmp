import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/utils/safeNext";

describe("safeNext", () => {
  it("keeps in-app paths with their query", () => {
    expect(safeNext("/dashboard?tab=zones&item=abc")).toBe(
      "/dashboard?tab=zones&item=abc"
    );
    expect(safeNext("/audit-log")).toBe("/audit-log");
  });

  it("refuses anything that could leave the app", () => {
    for (const bad of [
      "https://evil.example",
      "//evil.example/x",
      "/\\evil.example",
      "javascript:alert(1)",
      "/login?next=/x",
      "",
      null,
      undefined,
      "/x\nSet-Cookie: a=b",
    ]) {
      expect(safeNext(bad)).toBe("/dashboard");
    }
  });
});
