import { cookies } from "next/headers";
import { parseTheme, THEME_COOKIE, type Theme } from "@/lib/theme/theme";

// Theme chosen in the app (ThemeToggle writes the cookie), or null. The
// root layout puts it on <html data-theme> so the first paint is right.
export async function serverTheme(): Promise<Theme | null> {
  return parseTheme((await cookies()).get(THEME_COOKIE)?.value);
}
