// industrial-inspection-design-system v1.0 — Helcio Yassuo
export const DS = {
  // Surfaces
  bg: "#f0f4f8",
  sur: "#ffffff",
  sur2: "#f7f9fc",

  // Borders
  bord: "#dde4ed",
  bord2: "#c8d3df",

  // Text
  text: "#1e2d3d",
  text2: "#445566",
  text3: "#7a95b0",

  // Semantic
  red: "#c0392b", redBg: "#fdf2f2", redBord: "#f5c6c2",
  ora: "#c0591b", oraBg: "#fdf6f0", oraBord: "#f5d0b8",
  yel: "#a07c10", yelBg: "#fdfbee", yelBord: "#f0e0a0",
  grn: "#1e7e45", grnBg: "#f0faf4", grnBord: "#a8dfc0",
  blu: "#1a5cb5", bluBg: "#eef5ff", bluBord: "#aac8f0",
  vio: "#5b3aa0", vioBg: "#f3eeff", vioBord: "#c9b8f0",

  // Dark topbar / sidebar
  sbBg: "#2c3e52",
  sbBord: "#374f66",
  sbTxt: "#c5d6e8",
  sbTxt2: "#6a8faf",
  sbAct: "#3b5570",
  sbActTxt: "#93d4f5",

  // Typography — values use CSS variables loaded by next/font in app/layout.tsx
  // (Inter for sans, IBM Plex Mono for mono). Without var(--font-sans) inline
  // styles fall back to system fonts, which is the look that felt off.
  sans: "var(--font-sans), system-ui, -apple-system, sans-serif",
  mono: "var(--font-mono), 'IBM Plex Mono', 'Courier New', monospace",

  // Motion
  transition: "all 0.18s ease",
} as const;

export type DSToken = typeof DS;
