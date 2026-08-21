import { describe, it, expect, vi } from "vitest";
import {
  fmtMs,
  fmtBytes,
  fmtNum,
  fmtXidAge,
  fmtRelative,
  truncateSql,
  cn,
} from "./format";

describe("fmtMs", () => {
  it("formats sub-second durations in ms", () => {
    expect(fmtMs(450)).toBe("450ms");
  });
  it("formats seconds with one decimal", () => {
    expect(fmtMs(1500)).toBe("1.5s");
  });
  it("formats minutes and seconds", () => {
    expect(fmtMs(65_000)).toBe("1m 5s");
  });
  it("formats hours with one decimal", () => {
    expect(fmtMs(3_700_000)).toBe("1.0h");
  });
});

describe("fmtBytes", () => {
  it("handles zero", () => {
    expect(fmtBytes(0)).toBe("0 B");
  });
  it("formats bytes under 1KB as-is", () => {
    expect(fmtBytes(512)).toBe("512 B");
  });
  it("formats kilobytes", () => {
    expect(fmtBytes(2048)).toBe("2.0 KB");
  });
  it("formats megabytes", () => {
    expect(fmtBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
  it("formats gigabytes with two decimals", () => {
    expect(fmtBytes(2.5 * 1024 * 1024 * 1024)).toBe("2.50 GB");
  });
});

describe("fmtNum", () => {
  it("leaves small numbers as-is", () => {
    expect(fmtNum(42)).toBe("42");
  });
  it("formats thousands with K suffix", () => {
    expect(fmtNum(1500)).toBe("1.5K");
  });
  it("formats millions with M suffix", () => {
    expect(fmtNum(2_500_000)).toBe("2.5M");
  });
});

describe("fmtXidAge", () => {
  it("formats sub-million values with fmtNum", () => {
    expect(fmtXidAge(5000)).toBe("5.0K");
  });
  it("formats millions with M suffix (no decimal)", () => {
    expect(fmtXidAge(150_000_000)).toBe("150M");
  });
  it("formats billions with 2 decimals — near wraparound danger zone", () => {
    expect(fmtXidAge(1_800_000_000)).toBe("1.80B");
  });
});

describe("fmtRelative", () => {
  it('shows "just now" for very recent timestamps', () => {
    expect(fmtRelative(new Date())).toBe("just now");
  });
  it("shows seconds ago", () => {
    const d = new Date(Date.now() - 30_000);
    expect(fmtRelative(d)).toBe("30s ago");
  });
  it("shows minutes ago", () => {
    const d = new Date(Date.now() - 5 * 60_000);
    expect(fmtRelative(d)).toBe("5m ago");
  });
  it("accepts an ISO string as well as a Date", () => {
    const iso = new Date(Date.now() - 60_000).toISOString();
    expect(fmtRelative(iso)).toBe("1m ago");
  });
});

describe("truncateSql", () => {
  it("collapses whitespace and trims", () => {
    expect(truncateSql("  SELECT   *\n FROM users  ")).toBe(
      "SELECT * FROM users",
    );
  });
  it("leaves short queries untouched", () => {
    expect(truncateSql("SELECT 1", 100)).toBe("SELECT 1");
  });
  it("truncates long queries with an ellipsis", () => {
    const long = "SELECT " + "a".repeat(200);
    const result = truncateSql(long, 50);
    expect(result.length).toBe(51); // 50 chars + ellipsis
    expect(result.endsWith("…")).toBe(true);
  });
});

describe("cn (classname merge)", () => {
  it("joins truthy class names", () => {
    expect(cn("a", "b", false, undefined, "c")).toBe("a b c");
  });
});
