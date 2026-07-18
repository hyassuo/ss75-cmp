import { describe, it, expect } from "vitest";
import {
  fmt,
  fmtCompact,
  fmtShort,
  today,
  isOverdue,
  daysUntil,
} from "@/lib/utils/format";

describe("date formatters", () => {
  it("fmt renders the Brazilian long form", () => {
    expect(fmt("2026-07-12")).toBe("12 de jul. de 2026");
    expect(fmt(null)).toBe("-");
    expect(fmt(undefined)).toBe("-");
    expect(fmt("garbage")).toBe("garbage"); // passthrough when not Y-M-D
  });

  it("fmtCompact renders DD-Mon-YYYY", () => {
    expect(fmtCompact("2026-07-12")).toBe("12-Jul-2026");
    expect(fmtCompact(null)).toBe("-");
  });

  it("fmtShort renders DD/MM/YYYY", () => {
    expect(fmtShort("2026-07-05")).toBe("05/07/2026");
    expect(fmtShort(null)).toBe("-");
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
