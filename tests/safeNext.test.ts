import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/utils/safeNext";

describe("safeNext", () => {
  it("keeps in-app paths with their query", () => {
    expect(safeNext("/dashboard?tab=zones&item=abc")).toBe(
      "/dashboard?tab=zones&item=abc"
    );
    expect(safeNext("/audit-log")).toBe("/audit-log");
    expect(safeNext("/dashboard#top")).toBe("/dashboard#top");
  });

  it("returns the parsed (normalised) path, not the raw string", () => {
    expect(safeNext("/zones/../audit-log")).toBe("/audit-log");
    expect(safeNext("/a b")).toBe("/a%20b");
    // Encoded slashes and backslashes stay encoded: a path, not a host.
    expect(safeNext("/%2F%2Fevil.example")).toBe("/%2F%2Fevil.example");
    expect(safeNext("/%5Cevil.example")).toBe("/%5Cevil.example");
  });

  it("refuses anything that could leave the app", () => {
    for (const bad of [
      "https://evil.example",
      "//evil.example/x",
      "/\\evil.example",
      "javascript:alert(1)",
      "/javascript:alert(1)",
      "/login?next=/x",
      "",
      null,
      undefined,
      "/x\nSet-Cookie: a=b",
    ]) {
      expect(safeNext(bad)).toBe("/dashboard");
    }
  });

  it("refuses control characters the URL parser would strip", () => {
    for (const bad of [
      "/\t/evil.example",
      "/\t\\evil.example",
      "/\r/evil.example",
      "/\n/evil.example",
      "/\r\n/evil.example",
      "/\t\t//evil.example",
      "/dashboard\t",
      "/\u0000/evil.example",
      "/\u001f/evil.example",
      "/\u007f/evil.example",
    ]) {
      expect(safeNext(bad)).toBe("/dashboard");
    }
  });

  it("refuses backslashes anywhere", () => {
    for (const bad of [
      "/\\\\evil.example",
      "/x\\..\\..\\evil.example",
      "/dashboard\\",
      "/\\/evil.example",
    ]) {
      expect(safeNext(bad)).toBe("/dashboard");
    }
  });

  it("refuses paths that normalise to another origin or to /login", () => {
    for (const bad of [
      "/.//evil.example",
      "/..//evil.example",
      "/./../..//evil.example/x",
      "/x/..//evil.example",
      "/%2e//evil.example",
      "/./login",
      "/x/../login?next=/y",
      "/login",
      "/login/",
    ]) {
      expect(safeNext(bad)).toBe("/dashboard");
    }
  });

  it("never returns something that resolves off-origin", () => {
    const inputs = [
      "/\t/evil.example",
      "/.//evil.example",
      "/%2F%2Fevil.example",
      "/ /evil.example",
      "/ /evil.example",
      "/　/evil.example",
      "/∕∕evil.example",
      "/@evil.example",
      "/x?y=//evil.example",
    ];
    for (const raw of inputs) {
      const out = safeNext(raw);
      expect(out.startsWith("/") && !out.startsWith("//")).toBe(true);
      expect(new URL(out, "https://app.example").origin).toBe(
        "https://app.example"
      );
    }
  });
});
