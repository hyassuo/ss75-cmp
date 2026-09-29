import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { tApiError } from "@/lib/i18n/dict";
import {
  historyAction,
  historyField,
  historyNoteText,
  historyValue,
} from "@/lib/i18n/history";

const root = path.join(__dirname, "..");
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");

// E8: the PT screens show no English. Every visible string lives in the
// dictionary (lib/i18n/dict.ts) with both languages.
describe("dictionary", () => {
  it("every EN entry has a PT one (except language-neutral ones)", () => {
    const src = read("lib/i18n/dict.ts");
    const part = (from: string, to: string) =>
      src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from)));
    const keys = (s: string) =>
      new Set([...s.matchAll(/^\s*"([^"]+)":/gm)].map((m) => m[1]));
    const en = keys(part("const en = {", "} satisfies DictMap;"));
    const pt = keys(part("const pt: Translations = {", "const dicts"));
    const NEUTRAL = ["header.subtitle", "integrity.NA", "sece.na"];
    expect(en.size).toBeGreaterThan(500);
    expect([...en].filter((k) => !pt.has(k) && !NEUTRAL.includes(k))).toEqual([]);
  });

  it("every error message of the app's API routes has a PT translation", () => {
    const files = execFileSync("git", ["ls-files", "app/api", "lib/supabase/adminGuard.ts"], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\n")
      .filter((f) => f.endsWith(".ts"));
    const msgs = new Set<string>();
    for (const f of files) {
      for (const m of read(f).matchAll(/error: "([^"]+)"/g)) msgs.add(m[1]);
    }
    expect(msgs.size).toBeGreaterThan(20);
    expect([...msgs].filter((m) => tApiError("pt", m) === m)).toEqual([]);
    for (const m of msgs) expect(tApiError("en", m)).toBe(m);
    expect(tApiError("pt", "some raw database message")).toBe("some raw database message");
  });

  // Text written straight into JSX (element text and the attributes people
  // see or hear) must come from the dictionary. Only codes and units that
  // read the same in both languages may be literal.
  it("no literal UI text in JSX outside the dictionary", () => {
    const ALLOWED = new Set([
      "SECE", "RPN", "mm", "P", "C", "| P:", "x C:", "d", "v", "N/A",
      "SS-75 · Noble Courage", "SS-75 Noble Courage ·", "e-mail@abc.com",
      "· NORSOK M-001 / DNV-RP-G101 / ISO 21457 / NACE MR0175",
      "NORSOK M-001/M-503 · DNV-RP-G101 · ISO 21457 · NACE MR0175 · API 2C · DROPS HSE_7100.0_I",
    ]);
    const ATTRS = new Set(["placeholder", "aria-label", "title", "alt", "label", "text", "message", "confirmLabel"]);
    const files = execFileSync("git", ["ls-files", "app", "components", "lib"], { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter((f) => f.endsWith(".tsx"));
    const bad: string[] = [];
    for (const f of files) {
      const sf = ts.createSourceFile(f, read(f), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (n: ts.Node) => {
        let s: string | null = null;
        if (ts.isJsxText(n)) s = n.text.replace(/\s+/g, " ").trim();
        else if (
          ts.isJsxAttribute(n) &&
          ATTRS.has(n.name.getText(sf)) &&
          n.initializer &&
          ts.isStringLiteral(n.initializer)
        ) {
          s = n.initializer.text.trim();
        }
        if (s && /[A-Za-z]/.test(s) && !ALLOWED.has(s)) {
          bad.push(`${f}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1} ${s}`);
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(bad).toEqual([]);
  });
});

describe("history in the UI language", () => {
  it("every event and field the triggers write has a PT label", () => {
    const sql = execFileSync("git", ["ls-files", "supabase/migrations"], { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .map(read)
      .join("\n");
    const pairs = [...sql.matchAll(/\((?:NEW|OLD)\.(?:id|item_id), '([a-z_]+)', '([a-z_]+)'/g)];
    const actions = new Set([...pairs.map((m) => m[1]), "created", "deleted", "resolved", "reopened", "archived", "unarchived"]);
    const fields = new Set(pairs.map((m) => m[2]));
    expect(actions.size).toBeGreaterThan(30);
    const raw = (a: string) => a.replace(/_/g, " ");
    expect([...actions].filter((a) => historyAction(a, "pt") === raw(a))).toEqual([]);
    expect([...actions].filter((a) => historyAction(a, "en") !== raw(a))).toEqual([]);
    expect([...fields].filter((f) => historyField(f, "pt") === f && f !== "status")).toEqual([]);
  });

  it("event names and fields: stored form in EN, translated in PT", () => {
    expect(historyAction("reading_added", "en")).toBe("reading added");
    expect(historyAction("reading_added", "pt")).toBe("leitura adicionada");
    expect(historyAction("some_new_event", "pt")).toBe("some new event");
    expect(historyField("depth_mm", "en")).toBe("depth_mm");
    expect(historyField("next_insp", "pt")).toBe("próxima inspeção");
    expect(historyField("unknown_col", "pt")).toBe("unknown_col");
  });

  it("old/new values: labels, dates and decimals follow the language", () => {
    expect(historyValue("priority", "High", "pt")).toBe("Alta");
    expect(historyValue("priority", "High", "en")).toBe("High");
    expect(historyValue("status", "Attention", "pt")).toBe("Atenção");
    expect(historyValue("sece", "true", "pt")).toBe("SIM");
    expect(historyValue("sece", "false", "en")).toBe("NO");
    expect(historyValue("next_insp", "2026-10-09", "en")).toBe("9 Oct 2026");
    expect(historyValue("next_insp", "2026-10-09", "pt")).toBe("9 de out. de 2026");
    expect(historyValue("freq_insp", "Monthly", "pt")).toBe("Mensal");
    expect(historyValue("action_type", "Monitorar", "en")).toBe("Monitor");
    expect(historyValue("depth_mm", "0.700", "pt")).toBe("0,700");
    expect(historyValue("depth_mm", "0.700", "en")).toBe("0.700");
    expect(historyValue("file_path", "a/b_c.png", "pt")).toBe("a/b_c.png");
    expect(historyValue("mechanism", "Atmospheric Corrosion", "pt")).toBe("Corrosão Atmosférica");
    expect(historyValue("status", null, "pt")).toBe("-");
  });

  it("trigger notes are rebuilt; typed text is kept as typed", () => {
    expect(historyNoteText("Item created", "pt")).toBe("Item criado");
    expect(historyNoteText("Item created", "en")).toBe("Item created");
    expect(historyNoteText("Item deleted (2 readings, 1 evidences removed)", "pt")).toBe(
      "Item excluído (2 leituras e 1 evidências removidas)"
    );
    expect(historyNoteText("Reading added: 0.700 mm on 2026-10-09 at Frame 7", "en")).toBe(
      "Reading added: 0.700 mm on 9 Oct 2026 at Frame 7"
    );
    expect(historyNoteText("Reading removed: 1.500 mm on 2026-10-09", "pt")).toBe(
      "Leitura removida: 1,500 mm em 9 de out. de 2026"
    );
    const dash = "\u2014";
    expect(historyNoteText(`Evidence added: 2026-10-09 ${dash} Rust by the hatch`, "pt")).toBe(
      "Evidência adicionada: 9 de out. de 2026 - Rust by the hatch"
    );
    expect(historyNoteText(`Evidence removed: 2026-10-09 ${dash} `, "en")).toBe(
      "Evidence removed: 9 Oct 2026"
    );
    expect(historyNoteText("A note nobody knows", "pt")).toBe("A note nobody knows");
    expect(historyNoteText(null, "pt")).toBe("");
  });
});
