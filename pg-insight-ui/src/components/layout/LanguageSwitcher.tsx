import { cn } from "@/lib/format";
import { LOCALES, LOCALE_LABELS, useI18n } from "@/i18n";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t("common.language")}
      className={cn(
        "flex items-center rounded-lg border border-[var(--border)] p-0.5 gap-0.5",
        className,
      )}
    >
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLocale(code)}
          title={LOCALE_LABELS[code]}
          aria-pressed={locale === code}
          className={cn(
            "px-1.5 py-1 rounded-md text-[11px] font-medium uppercase transition-colors",
            locale === code
              ? "bg-[var(--bg-hover)] text-primary"
              : "text-muted hover:text-primary",
          )}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
