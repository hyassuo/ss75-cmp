// Dark mode is switched OFF for now (owner's request, 29/09/2026: it looked
// too heavy). While false, every page renders the light palette: the root
// layout puts data-theme="light" on <html> (which also shuts out the
// prefers-color-scheme block in app/globals.css) and the browser UI colour
// is the light one, whatever the device setting or a leftover theme cookie.
//
// To re-enable: set this to true. The dark palette is kept in
// app/globals.css and serverTheme() honours the cookie again (no cookie =
// follow the device), which on its own already gives a working dark mode
// that follows the device. The top-bar switch that wrote the cookie was
// removed; to bring it back, restore from git history (v1.21.1)
// components/layout/ThemeToggle.tsx, lib/theme/ThemeContext.tsx (with its
// ServerThemeProvider in app/layout.tsx), the theme.* EN/PT strings in
// lib/i18n/dict.ts and <ThemeToggle /> in the Topbar. tests/theme.test.ts
// and the E2E scenario e4theme pin the "off" state and change with it.
export const DARK_MODE_ENABLED = false;

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
