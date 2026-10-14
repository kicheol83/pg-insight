import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ALERT_METRICS } from "./AddRuleModal";

function backendMetricNames(): string[] {
  const source = readFileSync(
    resolve(
      __dirname,
      "../../../../pg-insight-back/src/alerts/alert-engine.service.ts",
    ),
    "utf8",
  );
  const block = /ALERT_METRIC_NAMES = \[([\s\S]*?)\] as const/.exec(source);
  if (!block) throw new Error("ALERT_METRIC_NAMES not found");
  return [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe("alert metrics", () => {
  it("offers exactly the metrics the backend evaluates", () => {
    expect(ALERT_METRICS.map((m) => m.value).sort()).toEqual(
      backendMetricNames().sort(),
    );
  });
});
