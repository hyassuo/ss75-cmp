// Colour theme picked in the app. No cookie = follow the device
// (prefers-color-scheme, handled in app/globals.css).
export type Theme = "light" | "dark";
export const THEME_COOKIE = "ss75-cmp.theme";

export function parseTheme(v: string | undefined | null): Theme | null {
  return v === "light" || v === "dark" ? v : null;
}
