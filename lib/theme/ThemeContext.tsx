"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Theme } from "@/lib/theme/theme";

// The theme cookie as the server read it for this page, so the top-bar
// toggle renders the right state in the server HTML (not "device" until
// hydration).
const ServerThemeContext = createContext<Theme | null>(null);

export function ServerThemeProvider({
  theme,
  children,
}: {
  theme: Theme | null;
  children: ReactNode;
}) {
  return (
    <ServerThemeContext.Provider value={theme}>{children}</ServerThemeContext.Provider>
  );
}

export function useServerTheme(): Theme | null {
  return useContext(ServerThemeContext);
}
