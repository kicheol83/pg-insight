export const LOCALES = ["ko", "en", "uz"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ko";

export const LOCALE_LABELS: Record<Locale, string> = {
  ko: "한국어",
  en: "English",
  uz: "O'zbekcha",
};

export type Entry = Record<Locale, string>;

export type Dictionary = Record<string, Entry>;

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (LOCALES as readonly string[]).includes(value)
  );
}
