import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { historyNote } from "@/lib/utils/historyNote";

const DASH = "\u2014";
const root = path.join(__dirname, "..");

// Every history note format string the triggers use (latest definitions
// and the upgrade files that may have written older rows).
function triggerFormats(): string[] {
  const dirs = ["supabase/migrations", "supabase/upgrades"];
  const out = new Set<string>();
  for (const d of dirs) {
    for (const f of fs.readdirSync(path.join(root, d))) {
      if (!f.endsWith(".sql")) continue;
      const sql = fs.readFileSync(path.join(root, d, f), "utf8");
      for (const m of sql.matchAll(/format\('((?:Evidence|Reading|Item)[^']*)'/g)) out.add(m[1]);
    }
  }
  return [...out];
}

describe("historyNote (notes written by the DB triggers)", () => {
  it("replaces the evidence separator with a plain hyphen", () => {
    expect(historyNote(`Evidence added: 2026-09-29 ${DASH} flange pitting`)).toBe(
      "Evidence added: 2026-09-29 - flange pitting"
    );
    expect(historyNote(`Evidence removed: 2026-01-02 ${DASH} old photo`)).toBe(
      "Evidence removed: 2026-01-02 - old photo"
    );
  });

  it("drops the dangling separator when there is no description", () => {
    expect(historyNote(`Evidence added: 2026-09-29 ${DASH} `)).toBe("Evidence added: 2026-09-29");
    expect(historyNote(`Evidence removed: 2026-09-29 ${DASH}`)).toBe("Evidence removed: 2026-09-29");
  });

  it("leaves the user's own description untouched (multi-line too)", () => {
    const desc = `coating A ${DASH} coating B\nsecond line`;
    expect(historyNote(`Evidence added: 2026-09-29 ${DASH} ${desc}`)).toBe(
      `Evidence added: 2026-09-29 - ${desc}`
    );
  });

  it("passes other notes through and maps null to an empty string", () => {
    expect(historyNote("Reading added: 0.700 mm on 2026-09-29 at P1")).toBe(
      "Reading added: 0.700 mm on 2026-09-29 at P1"
    );
    expect(historyNote("Item created")).toBe("Item created");
    expect(historyNote(`Note typed by someone ${DASH} kept`)).toBe(`Note typed by someone ${DASH} kept`);
    expect(historyNote(null)).toBe("");
    expect(historyNote(undefined)).toBe("");
  });

  it("covers every trigger format that contains a long dash", () => {
    const formats = triggerFormats();
    expect(formats.some((f) => f.startsWith("Evidence added"))).toBe(true);
    expect(formats.some((f) => f.startsWith("Evidence removed"))).toBe(true);
    for (const f of formats) {
      // Fill the placeholders the way format('%s') would.
      const vals = ["2026-09-29", "desc", "x"];
      let i = 0;
      const note = f.replace(/%s/g, () => vals[Math.min(i++, vals.length - 1)]);
      expect(historyNote(note), f).not.toContain(DASH);
    }
  });
});
