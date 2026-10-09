import React, { createContext, useContext, useEffect, useState } from "react";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./locales";
import { messages, type MessageKey } from "./messages";

export { LOCALES, LOCALE_LABELS, DEFAULT_LOCALE, type Locale } from "./locales";
export type { MessageKey } from "./messages";

const STORAGE_KEY = "pg-insight-locale";

export type TranslateParams = Record<string, string | number>;

export function translate(
  locale: Locale,
  key: MessageKey,
  params?: TranslateParams,
): string {
  const text: string = messages[key][locale];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

function readStoredLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

interface I18nCtx {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: TranslateParams) => string;
}

const Ctx = createContext<I18nCtx>({
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
  t: (key, params) => translate(DEFAULT_LOCALE, key, params),
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      return;
    }
  };

  const t = (key: MessageKey, params?: TranslateParams) =>
    translate(locale, key, params);

  return (
    <Ctx.Provider value={{ locale, setLocale, t }}>{children}</Ctx.Provider>
  );
}

export function useI18n() {
  return useContext(Ctx);
}
