"use client";

import { useEffect, useState } from "react";
import { DS } from "@/lib/design/tokens";
import { useLang } from "@/lib/context/LangContext";
import { parseTheme, THEME_COOKIE, type Theme } from "@/lib/theme/theme";

type Choice = Theme | "system";
const NEXT: Record<Choice, Choice> = { system: "light", light: "dark", dark: "system" };
const GLYPH: Record<Choice, string> = {
  system: "\u25D0", // circle with left half black
  light: "\u2600", // sun
  dark: "\u263E", // last quarter moon
};

// Top-bar button cycling device theme -> light -> dark. The choice lives in
// a cookie read by the root layout (no flash on the next load) and is
// applied at once through <html data-theme>.
export function ThemeToggle() {
  const { t } = useLang();
  const [choice, setChoice] = useState<Choice>("system");

  useEffect(() => {
    setChoice(parseTheme(document.documentElement.dataset.theme) ?? "system");
  }, []);

  function cycle() {
    const next = NEXT[choice];
    setChoice(next);
    const root = document.documentElement;
    if (next === "system") {
      delete root.dataset.theme;
      document.cookie = `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`;
    } else {
      root.dataset.theme = next;
      document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    }
  }

  const label = t("theme.label", t(`theme.${choice}`));
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      title={label}
      style={{
        background: "rgba(0,0,0,0.22)",
        border: "1px solid " + DS.sbBord,
        borderRadius: 6,
        color: DS.sbTxt,
        width: 40,
        height: 36,
        fontSize: 16,
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <span aria-hidden="true">{GLYPH[choice]}</span>
    </button>
  );
}
