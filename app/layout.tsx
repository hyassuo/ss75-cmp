import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import { PwaRegister } from "@/components/layout/PwaRegister";
import { RecoveryRedirect } from "@/components/layout/RecoveryRedirect";
import { LangProvider } from "@/lib/context/LangContext";
import { serverLang } from "@/lib/i18n/serverLang";
import { serverTheme } from "@/lib/theme/serverTheme";
import { ServerThemeProvider } from "@/lib/theme/ThemeContext";
import { THEME_COLOR } from "@/lib/theme/theme";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CMP | Noble Courage",
  description: "Corrosion Management Plan — SS-75 Noble Courage",
  applicationName: "SS-75 CMP",
  // iOS standalone mode (Add to Home Screen). The manifest handles Android.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SS-75 CMP",
  },
};

export async function generateViewport(): Promise<Viewport> {
  const theme = await serverTheme();
  return {
    width: "device-width",
    initialScale: 1,
    // No maximumScale: pinch-zoom must stay available (WCAG 1.4.4). iOS
    // auto-zoom on focus is avoided by 16px inputs on small screens instead
    // (globals.css).
    // Browser UI matches the top bar (DS.sbBg) of the theme in use: the
    // picked one, else the device's.
    themeColor: theme
      ? THEME_COLOR[theme]
      : [
          { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
          { color: THEME_COLOR.light },
        ],
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const lang = await serverLang();
  const theme = await serverTheme();
  return (
    <html lang={lang === "pt" ? "pt-BR" : "en"} data-theme={theme ?? undefined}>
      <body className={`${inter.variable} ${ibmPlexMono.variable}`}>
        <PwaRegister />
        <RecoveryRedirect />
        <LangProvider initialLang={lang}>
          <ServerThemeProvider theme={theme}>{children}</ServerThemeProvider>
        </LangProvider>
      </body>
    </html>
  );
}
