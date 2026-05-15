import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--ds-bg)",
        sur: "var(--ds-sur)",
        sur2: "var(--ds-sur2)",
        bord: "var(--ds-bord)",
        bord2: "var(--ds-bord2)",
        ds: {
          text: "var(--ds-text)",
          text2: "var(--ds-text2)",
          text3: "var(--ds-text3)",
          red: "var(--ds-red)",
          ora: "var(--ds-ora)",
          yel: "var(--ds-yel)",
          grn: "var(--ds-grn)",
          blu: "var(--ds-blu)",
          vio: "var(--ds-vio)",
        },
      },
      fontFamily: {
        sans: ["var(--font-ibm-plex-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-ibm-plex-mono)", "Courier New", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
