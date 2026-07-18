import type { MetadataRoute } from "next";

// PWA manifest — served at /manifest.webmanifest and auto-linked by Next.
// Colors come from the design system: sbBg (dark topbar) as theme, bg as
// the splash background. start_url "/" routes to /dashboard or /login
// depending on the session (app/page.tsx).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SS-75 CMP — Corrosion Management Plan",
    short_name: "SS-75 CMP",
    description:
      "Corrosion Management Plan — SS-75 Noble Courage. Inspections, risk matrix, evidence and reporting.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f0f4f8",
    theme_color: "#2c3e52",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
