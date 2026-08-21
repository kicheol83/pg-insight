import { describe, it, expect } from "vitest";
import {
  utilizationColor,
  xidAgeColor,
  lagColor,
  severityBadge,
  statusBadge,
} from "./colors";

describe("utilizationColor", () => {
  it("is green under 50%", () => {
    expect(utilizationColor(30)).toContain("green");
  });
  it("is blue between 50-75%", () => {
    expect(utilizationColor(60)).toContain("blue");
  });
  it("is yellow between 75-90%", () => {
    expect(utilizationColor(80)).toContain("yellow");
  });
  it("is red at 90% and above — critical threshold", () => {
    expect(utilizationColor(95)).toContain("red");
  });
  it("boundary: exactly 90% is red, not yellow", () => {
    expect(utilizationColor(90)).toContain("red");
  });
});

describe("xidAgeColor", () => {
  it("is green for young transactions", () => {
    expect(xidAgeColor(1_000_000)).toContain("green");
  });
  it("is red at wraparound danger zone (1B+)", () => {
    expect(xidAgeColor(1_000_000_000)).toContain("red");
  });
});

describe("lagColor", () => {
  it("is green for small lag", () => {
    expect(lagColor(1024)).toContain("green");
  });
  it("is red for lag over 200MB", () => {
    expect(lagColor(250 * 1024 * 1024)).toContain("red");
  });
});

describe("severityBadge", () => {
  it("returns critical styling for critical severity", () => {
    expect(severityBadge("critical")).toContain("red");
  });
  it("falls back to slate for unknown severity", () => {
    expect(severityBadge("unknown-severity")).toContain("slate");
  });
});

describe("statusBadge", () => {
  it("returns green styling for active status", () => {
    expect(statusBadge("active")).toContain("green");
  });
  it("returns red styling for error status", () => {
    expect(statusBadge("error")).toContain("red");
  });
});
