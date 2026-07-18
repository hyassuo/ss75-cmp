import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import { PwaRegister } from "@/components/layout/PwaRegister";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#2c3e52", // DS.sbBg — matches the dark topbar
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${ibmPlexMono.variable}`}>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
