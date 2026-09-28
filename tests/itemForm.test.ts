import { describe, expect, it } from "vitest";
import {
  diffPatch,
  formFromItem,
  patchFromForm,
  rebase,
  sameForm,
} from "@/components/items/itemForm";
import { today } from "@/lib/utils/format";
import { makeItem } from "./helpers";

describe("formFromItem", () => {
  it("shows a new draft with an empty name and today as last inspection", () => {
    const f = formFromItem(makeItem({ name: "Untitled", last_insp: null }), true);
    expect(f.name).toBe("");
    expect(f.last_insp).toBe(today());
  });

  it("uses today's effective priority, not the stored snapshot", () => {
    const f = formFromItem(
      makeItem({ prob: 3, cons: 4, priority: "Medium", next_insp: "2000-01-01" }),
      false
    );
    expect(f.priority).toBe("High"); // 12 + overdue 5
  });
});

describe("diffPatch", () => {
  const base = makeItem({ name: "Pump", notes: null, mechanism: null });

  it("is empty when nothing changed (empty strings equal NULL)", () => {
    const f = formFromItem(base, false);
    expect(diffPatch(patchFromForm(f, f.name), base)).toEqual({});
  });

  it("carries only the fields the user changed", () => {
    const f = { ...formFromItem(base, false), notes: "rust at weld" };
    expect(diffPatch(patchFromForm(f, f.name), base)).toEqual({
      notes: "rust at weld",
    });
  });

  it("persists a new item's name and default last inspection", () => {
    const draft = makeItem({ name: "Untitled", last_insp: null, next_insp: null });
    const f = { ...formFromItem(draft, true), name: "Riser clamp" };
    const patch = diffPatch(patchFromForm(f, "Riser clamp"), draft);
    expect(patch.name).toBe("Riser clamp");
    expect(patch.last_insp).toBe(today());
  });
});

describe("rebase", () => {
  it("keeps a colleague's newer values for fields the user didn't touch", () => {
    const original = makeItem({ status: "OK", notes: null });
    const mine = { ...formFromItem(original, false), notes: "my note" };
    const theirs = makeItem({ status: "Critical", notes: null });

    const merged = rebase(theirs, mine, formFromItem(original, false));
    expect(merged.status).toBe("Critical"); // theirs
    expect(merged.notes).toBe("my note"); // mine
    expect(diffPatch(patchFromForm(merged, merged.name), theirs)).toEqual({
      notes: "my note",
    });
  });

  it("recomputes derived fields from the merged values", () => {
    const original = makeItem({ freq_insp: "Annual", last_insp: "2026-01-01" });
    // I changed the last inspection date…
    const mine = { ...formFromItem(original, false), last_insp: "2026-03-01" };
    // …while a colleague changed the frequency.
    const theirs = makeItem({ freq_insp: "Quarterly", last_insp: "2026-01-01" });
    const merged = rebase(theirs, mine, formFromItem(original, false));
    expect(merged.freq_insp).toBe("Quarterly");
    expect(merged.last_insp).toBe("2026-03-01");
    expect(merged.next_insp).toBe("2026-05-31"); // 2026-03-01 + 91 days
  });

  it("is a no-op when the user changed nothing", () => {
    const original = makeItem();
    const theirs = makeItem({ notes: "theirs" });
    const f = formFromItem(original, false);
    expect(sameForm(rebase(theirs, f, f), formFromItem(theirs, false))).toBe(
      true
    );
  });
});
