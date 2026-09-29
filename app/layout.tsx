import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import { preconnect } from "react-dom";
import { PwaRegister } from "@/components/layout/PwaRegister";
import { RecoveryRedirect } from "@/components/layout/RecoveryRedirect";
import { LangProvider } from "@/lib/context/LangContext";
import { serverLang } from "@/lib/i18n/serverLang";
import { t } from "@/lib/i18n/dict";
import { serverTheme } from "@/lib/theme/serverTheme";
import { THEME_COLOR } from "@/lib/theme/theme";
import "./globals.css";

// Inter is a variable font: one file and one @font-face per subset cover
// every weight (a weight list only repeats the rules).
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Static faces, only the weights the UI sets on mono text (800 renders
// with the 700 face, as before). Not preloaded: the login page uses only
// its bold title, and a preload fetches every weight on every page.
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
  preload: false,
});

// Every page talks to Supabase from the browser (sign-in, the app's data):
// open that connection (DNS + TCP + TLS) while the page's code loads.
// Anonymous, like supabase-js's fetch (no credentials).
function supabaseOrigin(): string | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return null;
  }
}

// The layout already reads the language cookie, so the description can
// follow it at no extra cost.
export async function generateMetadata(): Promise<Metadata> {
  const lang = (await serverLang()) ?? "en";
  return {
    title: "CMP | Noble Courage",
    description: t(lang, "meta.description"),
    applicationName: "SS-75 CMP",
    // iOS standalone mode (Add to Home Screen). The manifest handles Android.
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "SS-75 CMP",
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const theme = await serverTheme();
  return {
    width: "device-width",
    initialScale: 1,
    // No maximumScale: pinch-zoom must stay available (WCAG 1.4.4). iOS
    // auto-zoom on focus is avoided by 16px inputs on small screens instead
    // (globals.css).
    // Browser UI matches the top bar (DS.sbBg) of the theme in use: the
    // picked one, else the device's. Always light while dark mode is off.
    themeColor: theme
      ? THEME_COLOR[theme]
      : [
          { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
          { color: THEME_COLOR.light },
        ],
    // A fixed theme also fixes the native controls (scrollbars, date
    // pickers) before the stylesheet loads.
    ...(theme ? { colorScheme: theme } : {}),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const lang = await serverLang();
  const theme = await serverTheme();
  const supabase = supabaseOrigin();
  if (supabase) preconnect(supabase, { crossOrigin: "anonymous" });
  return (
    <html lang={lang === "pt" ? "pt-BR" : "en"} data-theme={theme ?? undefined}>
      <body className={`${inter.variable} ${ibmPlexMono.variable}`}>
        <PwaRegister />
        <RecoveryRedirect />
        <LangProvider initialLang={lang}>
          {children}
        </LangProvider>
      </body>
    </html>
  );
}
