import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { translate, type DictKey, type Lang } from "@/lib/i18n/dict";

// E7 (owner's request): no emoji or pictographic symbols (also the
// text-style ones iOS paints in colour, with or without the emoji variation
// selector) and no long dashes anywhere in the product.
const PICTO = /[\p{Extended_Pictographic}\u{FE0F}\u{20E3}]/u;
const DASH = "\u2014";
const root = path.join(__dirname, "..");

// Long dashes allowed: only inside function bodies already stored in the
// production database (changing them would make the repo drift from the
// live schema). Three of them are history-note separators, replaced on
// display by lib/utils/historyNote.ts.
const DASH_ALLOWED: Record<string, number> = {
  "supabase/migrations/20260928000000_baseline.sql": 6,
  "supabase/migrations/20260929000100_active_reads_insert_audit.sql": 3,
  "supabase/upgrades/hardening-5.sql": 5,
};

function trackedTextFiles(): string[] {
  return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((f) => f && !/\.(png|ico|jpe?g|webp|woff2?|pdf|xlsx)$/.test(f))
    .filter((f) => fs.existsSync(path.join(root, f)));
}

describe("no emoji and no long dashes (E7)", () => {
  it("every EN/PT string in the dictionary", () => {
    const src = fs.readFileSync(path.join(root, "lib/i18n/dict.ts"), "utf8");
    const keys = [...new Set([...src.matchAll(/^\s*"([a-zA-Z][^"]*)":/gm)].map((m) => m[1]))];
    expect(keys.length).toBeGreaterThan(300);
    const bad: string[] = [];
    for (const lang of ["en", "pt"] as Lang[]) {
      for (const k of keys) {
        const v = translate(lang, k as DictKey);
        const s = typeof v === "function" ? (v as (...a: unknown[]) => string)(3, 5, "x") : v;
        if (typeof s === "string" && (PICTO.test(s) || s.includes(DASH))) bad.push(`${lang} ${k}: ${s}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("every tracked file: no emoji; long dashes only in the stored SQL function bodies", () => {
    const picto: string[] = [];
    const dashes: Record<string, number> = {};
    for (const f of trackedTextFiles()) {
      const text = fs.readFileSync(path.join(root, f), "utf8");
      text.split("\n").forEach((line, i) => {
        if (PICTO.test(line)) picto.push(`${f}:${i + 1}`);
      });
      const n = text.split(DASH).length - 1;
      if (n) dashes[f] = n;
    }
    expect(picto).toEqual([]);
    expect(dashes).toEqual(DASH_ALLOWED);
  });
});
