"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Lang } from "@/lib/i18n/dict";
import {
  translate,
  tPriority,
  tStatus,
  tDept,
  tIntegrity,
  type DictKey,
} from "@/lib/i18n/dict";
import type { EffectiveStatus, ItemPriority, ItemStatus } from "@/lib/types/domain";

const STORAGE_KEY = "ss75-cmp.lang";
// Also mirrored to a cookie so the server renders the right language (and
// <html lang>) on the first paint: see lib/i18n/serverLang.ts.
export const LANG_COOKIE = "ss75-cmp.lang";

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
  // Generic translator: returns either the string or the function value
  // (callers using a function value pass arguments themselves).
  raw: <K extends DictKey>(key: K) => ReturnType<typeof translate>;
  // String-only helper. Looks up `key`; if the dict entry is a function it
  // calls it with `args` and returns the result.
  t: (key: DictKey, ...args: unknown[]) => string;
  tPriority: (p: ItemPriority | null) => string;
  tStatus: (s: ItemStatus | EffectiveStatus) => string;
  tDept: (d: string) => string;
  tIntegrity: (label: string) => string;
}

const LangContext = createContext<LangState | null>(null);

function persist(l: Lang) {
  try {
    window.localStorage.setItem(STORAGE_KEY, l);
  } catch {
    // ignore
  }
  document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
}

export function LangProvider({
  children,
  initialLang,
}: {
  children: ReactNode;
  /** From the cookie, read on the server (no EN→PT flash). */
  initialLang?: Lang | null;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang ?? "en");

  // Browsers from before the cookie existed only have localStorage.
  useEffect(() => {
    if (initialLang) return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "en" || stored === "pt") {
        setLangState(stored);
        persist(stored);
      }
    } catch {
      // Storage disabled (private mode): just stick with the EN default.
    }
  }, [initialLang]);

  // Keep <html lang> in sync for screen readers, hyphenation and spelling.
  useEffect(() => {
    document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    persist(l);
  }, []);

  const t = useCallback(
    (key: DictKey, ...args: unknown[]): string => {
      const v = translate(lang, key);
      if (typeof v === "function") {
        return (v as (...a: unknown[]) => string)(...args);
      }
      return String(v);
    },
    [lang]
  );

  const value: LangState = {
    lang,
    setLang,
    raw: (key) => translate(lang, key),
    t,
    tPriority: (p) => tPriority(lang, p),
    tStatus: (s) => tStatus(lang, s),
    tDept: (d) => tDept(lang, d),
    tIntegrity: (l) => tIntegrity(lang, l),
  };

  return (
    <LangContext.Provider value={value}>{children}</LangContext.Provider>
  );
}

export function useLang(): LangState {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LangProvider");
  return ctx;
}
