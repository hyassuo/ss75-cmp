import { describe, it, expect } from "vitest";
import {
  ACTION_DUE_DAYS,
  suggestActionDue,
  isActionOpen,
  isActionOverdue,
} from "@/lib/domain/actionPlan";
import { makeItem } from "./helpers";

describe("suggestActionDue", () => {
  it("returns null without a priority or with a bad date", () => {
    expect(suggestActionDue(null, "2026-01-01")).toBeNull();
    expect(suggestActionDue("High", "garbage")).toBeNull();
  });

  it("adds the fixed day count per priority", () => {
    expect(ACTION_DUE_DAYS).toEqual({
      Critical: 90,
      High: 180,
      Medium: 365,
      Low: 1095,
    });
    expect(suggestActionDue("Critical", "2026-01-01")).toBe("2026-04-01");
    expect(suggestActionDue("High", "2026-01-01")).toBe("2026-06-30");
    expect(suggestActionDue("Medium", "2026-01-01")).toBe("2027-01-01");
    // 1095 fixed days spanning leap-year 2028 → lands one day short of
    // three calendar years.
    expect(suggestActionDue("Low", "2026-01-01")).toBe("2028-12-31");
  });

  it("crosses year boundaries correctly", () => {
    expect(suggestActionDue("Critical", "2026-11-15")).toBe("2027-02-13");
  });
});

describe("isActionOpen", () => {
  it("false without an action type", () => {
    expect(isActionOpen(makeItem())).toBe(false);
    expect(isActionOpen(makeItem({ action_status: "Planejado" }))).toBe(false);
  });

  it("false when done", () => {
    expect(
      isActionOpen(
        makeItem({ action_type: "Monitorar", action_status: "Executado" })
      )
    ).toBe(false);
  });

  it("true otherwise — null status counts as open (implicit 'Sem planejamento')", () => {
    expect(isActionOpen(makeItem({ action_type: "Monitorar" }))).toBe(true);
    expect(
      isActionOpen(
        makeItem({ action_type: "Substituição", action_status: "Em execução" })
      )
    ).toBe(true);
  });
});

describe("isActionOverdue", () => {
  const TODAY = "2026-06-15";

  it("false without a due date or when done", () => {
    expect(
      isActionOverdue(makeItem({ action_type: "Monitorar" }), TODAY)
    ).toBe(false);
    expect(
      isActionOverdue(
        makeItem({
          action_type: "Monitorar",
          action_due: "2026-01-01",
          action_status: "Executado",
        }),
        TODAY
      )
    ).toBe(false);
  });

  it("false without an action type even if a stale due date exists", () => {
    expect(
      isActionOverdue(makeItem({ action_due: "2026-01-01" }), TODAY)
    ).toBe(false);
  });

  it("true when due date passed and not done", () => {
    expect(
      isActionOverdue(
        makeItem({ action_type: "Monitorar", action_due: "2026-06-14" }),
        TODAY
      )
    ).toBe(true);
  });

  it("due today is NOT overdue (strict <, same semantics as isOverdue)", () => {
    expect(
      isActionOverdue(
        makeItem({ action_type: "Monitorar", action_due: TODAY }),
        TODAY
      )
    ).toBe(false);
  });
});
