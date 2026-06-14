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

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
  // Generic translator — returns either the string or the function value
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

export function LangProvider({ children }: { children: ReactNode }) {
  // Initialise from localStorage so the choice survives reloads. SSR-safe
  // because we only touch localStorage in the effect.
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "en" || stored === "pt") setLangState(stored);
    } catch {
      // Storage disabled (private mode) — just stick with the EN default.
    }
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // ignore
    }
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
