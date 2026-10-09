import { clsx, type ClassValue } from "clsx";

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

export const fmtMs = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000)
    return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
};

export const fmtBytes = (b: number): string => {
  if (b === 0) return "0 B";
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
};

export const fmtNum = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

export const fmtXidAge = (age: number): string => {
  if (age >= 1_000_000_000) return `${(age / 1_000_000_000).toFixed(2)}B`;
  if (age >= 1_000_000) return `${(age / 1_000_000).toFixed(0)}M`;
  return fmtNum(age);
};

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

export const fmtRelative = (d: Date | string, locale?: string): string => {
  const dt = typeof d === "string" ? new Date(d) : d;
  const s = Math.floor((Date.now() - dt.getTime()) / 1000);
  if (locale) {
    const rtf = new Intl.RelativeTimeFormat(locale, {
      numeric: "auto",
      style: "narrow",
    });
    if (s < 5) return rtf.format(0, "second");
    const [unit, size] =
      RELATIVE_UNITS.find(([, sec]) => s >= sec) ?? RELATIVE_UNITS[3];
    return rtf.format(-Math.floor(s / size), unit);
  }
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export const truncateSql = (sql: string, maxLen = 100): string => {
  const n = sql.replace(/\s+/g, " ").trim();
  return n.length <= maxLen ? n : n.slice(0, maxLen) + "…";
};

export const tickTime = (v: string) => {
  const d = new Date(v);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
