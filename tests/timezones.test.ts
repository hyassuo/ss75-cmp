import { afterAll, describe, expect, it } from "vitest";
import { addDays } from "@/lib/utils/format";
import { calcNextInspection } from "@/lib/domain/calcNextInspection";
import { suggestActionDue } from "@/lib/domain/actionPlan";

// Calendar math must not depend on the viewer's time zone. Node applies a
// runtime change of process.env.TZ to Date immediately, so each zone below
// is exercised in-process. New York / London / Oslo cross a DST change
// between January and April, which used to cost a day.
const ZONES = [
  "UTC",
  "America/Sao_Paulo",
  "America/New_York",
  "Europe/London",
  "Europe/Oslo",
  "Asia/Tokyo",
  "Pacific/Auckland",
];
const original = process.env.TZ;
afterAll(() => {
  process.env.TZ = original;
});

describe.each(ZONES)("date math in %s", (tz) => {
  it("is time-zone independent", () => {
    process.env.TZ = tz;
    expect(addDays("2026-01-01", 91)).toBe("2026-04-02");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30"); // EU DST start
    expect(addDays("2026-10-31", 2)).toBe("2026-11-02"); // US DST end
    expect(addDays("2026-01-31", -31)).toBe("2025-12-31");
    expect(calcNextInspection("2026-01-01", "Quarterly")).toBe("2026-04-02");
    expect(calcNextInspection("2026-02-20", "Monthly")).toBe("2026-03-22");
    expect(suggestActionDue("Critical", "2026-01-01")).toBe("2026-04-01");
  });
});

describe("addDays", () => {
  it("rejects garbage", () => {
    expect(addDays("not a date", 1)).toBeNull();
  });
});
