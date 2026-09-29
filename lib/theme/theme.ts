// Colour theme picked in the app. No cookie = follow the device
// (prefers-color-scheme, handled in app/globals.css).
export type Theme = "light" | "dark";
export const THEME_COOKIE = "ss75-cmp.theme";

export function parseTheme(v: string | undefined | null): Theme | null {
  return v === "light" || v === "dark" ? v : null;
}

// Browser UI colour (<meta name="theme-color">) per theme: --ds-sb-bg of
// each palette in app/globals.css, so it matches the top bar. A literal:
// the meta tag can't resolve a CSS variable (tests/theme.test.ts keeps
// them in sync).
export const THEME_COLOR: Record<Theme, string> = {
  light: "#2c3e52",
  dark: "#111b26",
};
