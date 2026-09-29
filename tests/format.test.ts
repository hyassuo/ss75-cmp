import { describe, it, expect } from "vitest";
import {
  fmt,
  fmtCompact,
  fmtDateTime,
  fmtNum,
  fmtShort,
  today,
  isOverdue,
  daysUntil,
} from "@/lib/utils/format";

// Dates follow the UI language: pt-BR in PT, en-GB ("9 Oct 2026") in EN.
describe("date formatters", () => {
  it("fmt: medium date in the UI language", () => {
    expect(fmt("2026-10-09", "en")).toBe("9 Oct 2026");
    expect(fmt("2026-10-09", "pt")).toBe("9 de out. de 2026");
    expect(fmt("2026-07-12", "pt")).toBe("12 de jul. de 2026");
    expect(fmt("2026-09-01", "en")).toBe("1 Sep 2026"); // not ICU's "Sept"
    expect(fmt("2026-05-31", "pt")).toBe("31 de mai. de 2026");
    for (const lang of ["en", "pt"] as const) {
      expect(fmt(null, lang)).toBe("-");
      expect(fmt(undefined, lang)).toBe("-");
      expect(fmt("garbage", lang)).toBe("garbage"); // passthrough when not Y-M-D
      expect(fmt("2026-13-01", lang)).toBe("2026-13-01");
    }
  });

  it("fmt matches Intl for pt-BR and en-GB on every month", () => {
    for (let m = 1; m <= 12; m++) {
      const iso = `2026-${String(m).padStart(2, "0")}-09`;
      const d = new Date(Date.UTC(2026, m - 1, 9));
      const opts = { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" } as const;
      expect(fmt(iso, "pt")).toBe(new Intl.DateTimeFormat("pt-BR", opts).format(d));
      // ICU writes September as "Sept" in en-GB; the app keeps three letters.
      expect(fmt(iso, "en")).toBe(
        new Intl.DateTimeFormat("en-GB", opts).format(d).replace("Sept", "Sep")
      );
    }
  });

  it("fmtCompact: DD-Mon-YYYY in the UI language", () => {
    expect(fmtCompact("2026-07-12", "en")).toBe("12-Jul-2026");
    expect(fmtCompact("2026-10-09", "en")).toBe("09-Oct-2026");
    expect(fmtCompact("2026-10-09", "pt")).toBe("09-out-2026");
    expect(fmtCompact(null, "pt")).toBe("-");
  });

  it("fmtShort renders DD/MM/YYYY (day first in pt-BR and en-GB)", () => {
    expect(fmtShort("2026-07-05")).toBe("05/07/2026");
    expect(fmtShort(null)).toBe("-");
  });

  it("fmtDateTime: local date and 24 h time", () => {
    const ms = new Date(2026, 9, 9, 14, 5).getTime(); // local 9 Oct 2026 14:05
    expect(fmtDateTime(ms, "en")).toBe("9 Oct 2026, 14:05");
    expect(fmtDateTime(ms, "pt")).toBe("9 de out. de 2026, 14:05");
    expect(fmtDateTime(NaN, "en")).toBe("-");
  });

  it("fmtNum: decimal comma in PT, point in EN", () => {
    expect(fmtNum(1.5, "en")).toBe("1.5");
    expect(fmtNum(1.5, "pt")).toBe("1,5");
    expect(fmtNum(0.6081, "pt", 3)).toBe("0,608");
    expect(fmtNum(0.6081, "en", 3)).toBe("0.608");
    expect(fmtNum(12, "pt")).toBe("12");
    expect(fmtNum(-0.2, "pt", 2)).toBe("-0,20");
  });
});

describe("today / isOverdue / daysUntil", () => {
  it("today() is the LOCAL calendar date", () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const d = new Date();
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(today()).toBe(local);
  });

  it("isOverdue is strict-past and null-safe", () => {
    expect(isOverdue("2000-01-01")).toBe(true);
    expect(isOverdue("2999-12-31")).toBe(false);
    expect(isOverdue(today())).toBe(false); // due today is not overdue
    expect(isOverdue(null)).toBe(false);
    expect(isOverdue(undefined)).toBe(false);
  });

  it("daysUntil", () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil(today())).toBe(0);
    const past = daysUntil("2000-01-01");
    expect(past).not.toBeNull();
    expect(past as number).toBeLessThan(0);
    const future = daysUntil("2999-01-01");
    expect(future as number).toBeGreaterThan(0);
  });
});
