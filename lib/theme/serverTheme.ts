import { cookies } from "next/headers";
import { DARK_MODE_ENABLED, parseTheme, THEME_COOKIE, type Theme } from "@/lib/theme/theme";

// Theme for <html data-theme>: always "light" while dark mode is off (see
// DARK_MODE_ENABLED); otherwise the cookie's choice, or null to follow the
// device.
export async function serverTheme(): Promise<Theme | null> {
  if (!DARK_MODE_ENABLED) return "light";
  return parseTheme((await cookies()).get(THEME_COOKIE)?.value);
}
