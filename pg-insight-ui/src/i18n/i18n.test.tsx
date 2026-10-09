import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider, LOCALES, translate, useI18n } from "./index";
import { messages, type MessageKey } from "./messages";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("message catalog", () => {
  const entries = Object.entries(messages) as Array<
    [MessageKey, Record<(typeof LOCALES)[number], string>]
  >;

  it("has a non-empty text for every locale", () => {
    const missing = entries.flatMap(([key, entry]) =>
      LOCALES.filter((locale) => !entry[locale]?.trim()).map(
        (locale) => `${key}:${locale}`,
      ),
    );
    expect(missing).toEqual([]);
  });

  it("uses the same placeholders in every locale", () => {
    const mismatched = entries
      .filter(([, entry]) => {
        const expected = placeholders(entry.en).join(",");
        return LOCALES.some(
          (locale) => placeholders(entry[locale]).join(",") !== expected,
        );
      })
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });
});

describe("translate", () => {
  it("returns the Korean text", () => {
    expect(translate("ko", "nav.dashboard")).toBe("대시보드");
  });

  it("leaves unknown placeholders untouched", () => {
    expect(translate("en", "common.cancel", { x: 1 })).toBe("Cancel");
  });
});

function Probe() {
  const { t } = useI18n();
  return <p>{t("nav.dashboard")}</p>;
}

describe("LanguageSwitcher", () => {
  beforeEach(() => localStorage.clear());

  it("starts in Korean and switches language for the whole tree", () => {
    render(
      <I18nProvider>
        <LanguageSwitcher />
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByText("대시보드")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("ko");

    fireEvent.click(screen.getByRole("button", { name: "en" }));

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem("pg-insight-locale")).toBe("en");
  });

  it("restores the saved language", () => {
    localStorage.setItem("pg-insight-locale", "uz");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByText("Boshqaruv paneli")).toBeInTheDocument();
  });
});
