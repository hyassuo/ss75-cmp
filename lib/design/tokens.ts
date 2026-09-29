// industrial-inspection-design-system v1.0 — Helcio Yassuo
// Colours are CSS custom properties (app/globals.css) so the light and
// dark themes swap without re-rendering: the values below are var()
// references, usable anywhere a CSS colour is (inline styles, SVG style).
// Every text/background pair meets WCAG AA (4.5:1) in both themes,
// including 10px badge text on its tinted chip (tint(color, 13) on sur2).
// Field use: tablets in direct sun or dimmed at night.
// To add transparency use tint() — appending hex alpha ("…" + "20") does
// not work on a var().
export const DS = {
  // Surfaces
  bg: "var(--ds-bg)",
  sur: "var(--ds-sur)",
  sur2: "var(--ds-sur2)",

  // Borders
  bord: "var(--ds-bord)",
  bord2: "var(--ds-bord2)",

  // Text
  text: "var(--ds-text)",
  text2: "var(--ds-text2)",
  text3: "var(--ds-text3)",

  // Semantic
  red: "var(--ds-red)",
  redBg: "var(--ds-red-bg)",
  redBord: "var(--ds-red-bord)",
  ora: "var(--ds-ora)",
  oraBg: "var(--ds-ora-bg)",
  oraBord: "var(--ds-ora-bord)",
  yel: "var(--ds-yel)",
  yelBg: "var(--ds-yel-bg)",
  yelBord: "var(--ds-yel-bord)",
  grn: "var(--ds-grn)",
  grnBg: "var(--ds-grn-bg)",
  grnBord: "var(--ds-grn-bord)",
  blu: "var(--ds-blu)",
  bluBg: "var(--ds-blu-bg)",
  bluBord: "var(--ds-blu-bord)",
  vio: "var(--ds-vio)",
  vioBg: "var(--ds-vio-bg)",
  vioBord: "var(--ds-vio-bord)",
  onAccent: "var(--ds-on-accent)",

  // Dark topbar / sidebar
  sbBg: "var(--ds-sb-bg)",
  sbBand: "var(--ds-sb-band)", // lower band of the top bar, a shade darker
  sbBord: "var(--ds-sb-bord)",
  sbTxt: "var(--ds-sb-txt)",
  sbTxt2: "var(--ds-sb-txt2)",
  sbAct: "var(--ds-sb-act)",
  sbActTxt: "var(--ds-sb-act-txt)",

  // Typography — values use CSS variables loaded by next/font in app/layout.tsx
  // (Inter for sans, IBM Plex Mono for mono). Without var(--font-sans) inline
  // styles fall back to system fonts, which is the look that felt off.
  sans: "var(--font-sans), system-ui, -apple-system, sans-serif",
  mono: "var(--font-mono), 'IBM Plex Mono', 'Courier New', monospace",

  // Type scale (px). Every inline fontSize uses one of these steps. Nothing
  // is smaller than 10 px: the app is read on tablets out on deck.
  fs: {
    xs: 10, // captions, table headers, small badges, overline labels
    sm: 11, // secondary / meta text, badges, section labels
    md: 12, // dense UI text: tables, inputs, notices, small buttons
    base: 13, // body text, buttons
    lg: 14, // emphasised body, large buttons, sign-in fields
    xl: 16, // empty-state titles, tile values, icon glyphs
    h3: 18, // modal and form headings, small KPI values
    h2: 22, // KPI numbers
    h1: 28, // headline numbers, empty-state pictograms
    display: 48, // the 404 code
  },

  // Motion
  transition: "all 0.18s ease",
} as const;

// A colour at pct% opacity (the chip / tinted-cell backgrounds).
export function tint(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

export type DSToken = typeof DS;
