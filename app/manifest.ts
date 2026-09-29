import type { MetadataRoute } from "next";

// PWA manifest, served at /manifest.webmanifest and auto-linked by Next.
// Colors come from the design system: sbBg (dark topbar) as theme, bg as
// the splash background. The app opens straight on /dashboard (the proxy
// sends a signed-out user to /login and back): a start_url of "/" cost a
// redirect round-trip on every launch. The id keeps the installed app the
// same one.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SS-75 CMP · Corrosion Management Plan",
    short_name: "SS-75 CMP",
    description:
      "Corrosion Management Plan for SS-75 Noble Courage. Inspections, risk matrix, evidence and reporting.",
    id: "/",
    start_url: "/dashboard",
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
