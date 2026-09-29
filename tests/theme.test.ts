import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { DS, tint } from "@/lib/design/tokens";
import { DARK_MODE_ENABLED, parseTheme, THEME_COLOR } from "@/lib/theme/theme";

// The palettes in app/globals.css: light on :root, dark twice (device
// preference, and data-theme="dark"). Dark mode is off for now, but its
// palette is kept (and checked) so it can be switched back on.
const css = fs.readFileSync(path.join(__dirname, "..", "app", "globals.css"), "utf8");

function palette(selector: string): Record<string, string> {
  const at = css.indexOf(selector + " {");
  expect(at, selector).toBeGreaterThanOrEqual(0);
  const body = css.slice(at, css.indexOf("}", at));
  const out: Record<string, string> = {};
  for (const [, k, v] of body.matchAll(/--ds-([\w-]+):\s*(#[0-9a-f]{6});/gi)) out[k] = v.toLowerCase();
  return out;
}
const LIGHT = palette(":root");
const DARK = palette(':root:not([data-theme="light"])');
const DARK2 = palette(':root[data-theme="dark"]');

type RGB = [number, number, number];
const rgb = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const lum = (c: RGB) => {
  const f = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const ratio = (a: RGB, b: RGB) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
// tint(color, pct) painted over an opaque background.
const over = (c: RGB, pct: number, bg: RGB): RGB =>
  c.map((v, i) => v * (pct / 100) + bg[i] * (1 - pct / 100)) as RGB;

const ACCENTS = ["red", "ora", "yel", "grn", "blu", "vio"];

// Text/background pairs the UI actually paints, with the WCAG minimum.
function pairs(p: Record<string, string>): Array<[string, number, number]> {
  const c = (k: string) => rgb(p[k]);
  const out: Array<[string, number, number]> = [];
  for (const t of ["text", "text2", "text3"])
    for (const b of ["bg", "sur", "sur2"]) out.push([`${t} on ${b}`, ratio(c(t), c(b)), 4.5]);
  out.push(["text3 on bord (disabled button)", ratio(c("text3"), c("bord")), 4.5]);
  out.push(["text3 badge on sur", ratio(c("text3"), over(c("text3"), 13, c("sur"))), 4.5]);
  for (const a of ACCENTS) {
    for (const b of ["bg", "sur", "sur2", `${a}-bg`]) out.push([`${a} on ${b}`, ratio(c(a), c(b)), 4.5]);
    // Badge: 10-11px text on tint(color, 13).
    for (const b of ["bg", "sur", "sur2"])
      out.push([`${a} badge on ${b}`, ratio(c(a), over(c(a), 13, c(b))), 4.5]);
    // Risk matrix cell: label on tint(9), item chip text on tint(16) over it.
    const cell = over(c(a), 9, c("sur"));
    out.push([`${a} risk-cell label`, ratio(c(a), cell), 4.5]);
    out.push([`text on ${a} risk-cell chip`, ratio(c("text"), over(c(a), 16, cell)), 4.5]);
    out.push([`on-accent on ${a}`, ratio(c("on-accent"), c(a)), 4.5]);
  }
  for (const b of ["sb-bg", "sb-band"])
    for (const t of ["sb-txt", "sb-txt2", "sb-act-txt"]) out.push([`${t} on ${b}`, ratio(c(t), c(b)), 4.5]);
  out.push(["sb-act-txt on sb-act", ratio(c("sb-act-txt"), c("sb-act")), 4.5]);
  out.push(["white on sb-act (top-bar pill)", ratio([255, 255, 255], c("sb-act")), 4.5]);
  return out;
}

describe("theme palettes (app/globals.css)", () => {
  it("both dark blocks are identical", () => {
    expect(DARK2).toEqual(DARK);
  });

  it("every token in lib/design/tokens.ts is defined in both palettes", () => {
    const names = Object.values(DS)
      .map((v) => /^var\(--ds-([\w-]+)\)$/.exec(String(v))?.[1])
      .filter((v): v is string => !!v);
    expect(names.length).toBeGreaterThan(30);
    for (const n of names) {
      expect(LIGHT[n], `light --ds-${n}`).toBeDefined();
      expect(DARK[n], `dark --ds-${n}`).toBeDefined();
    }
    expect(Object.keys(DARK).sort()).toEqual(Object.keys(LIGHT).sort());
  });

  it.each([
    ["light", LIGHT],
    ["dark", DARK],
  ] as const)("%s: every text/background pair meets WCAG AA", (_name, p) => {
    const failing = pairs(p)
      .filter(([, r, need]) => r < need)
      .map(([k, r]) => `${k}: ${r.toFixed(2)}`);
    expect(failing).toEqual([]);
  });

  it("theme-color literals match --ds-sb-bg", () => {
    expect(THEME_COLOR.light).toBe(LIGHT["sb-bg"]);
    expect(THEME_COLOR.dark).toBe(DARK["sb-bg"]);
  });

  it("dark palette is screen-only (printing stays light)", () => {
    expect(css).toMatch(/@media screen and \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)/);
    expect(css).toMatch(/@media screen\s*\{\s*:root\[data-theme="dark"\]/);
  });
});

describe("dark mode switched off (DARK_MODE_ENABLED)", () => {
  const root = path.join(__dirname, "..");
  const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");

  it("is off", () => {
    expect(DARK_MODE_ENABLED).toBe(false);
  });

  it("the device preference only applies without data-theme=\"light\"", () => {
    // The layout always sets data-theme="light" while off: this guard is
    // what keeps a phone in system dark mode on the light palette.
    const any = css.match(/prefers-color-scheme:\s*dark/g) ?? [];
    const guarded = css.match(/@media screen and \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{/g) ?? [];
    expect(any.length).toBeGreaterThan(0);
    expect(guarded.length).toBe(any.length);
  });

  it("serverTheme ignores the cookie and the layout uses it for <html> and the viewport", () => {
    expect(read("lib/theme/serverTheme.ts")).toMatch(/if \(!DARK_MODE_ENABLED\) return "light";/);
    const layout = read("app/layout.tsx");
    expect(layout).toMatch(/data-theme=\{theme \?\? undefined\}/);
    expect(layout).toMatch(/colorScheme: theme/);
  });

  it("no theme switch is left in the UI", () => {
    expect(fs.existsSync(path.join(root, "components/layout/ThemeToggle.tsx"))).toBe(false);
    expect(read("components/layout/Topbar.tsx")).not.toMatch(/Theme/);
  });
});

describe("tint / parseTheme", () => {
  it("tint mixes with transparent (works on var() colours)", () => {
    expect(tint(DS.red, 13)).toBe("color-mix(in srgb, var(--ds-red) 13%, transparent)");
  });

  it("parseTheme accepts only light / dark", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    for (const v of [undefined, null, "", "system", "DARK", "dark;"]) expect(parseTheme(v)).toBeNull();
  });
});
