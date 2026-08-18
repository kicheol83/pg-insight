import type { BadgeVariant } from "@/components/ui";

export type QueryTag =
  | "slow"
  | "very-slow"
  | "inconsistent"
  | "low-cache"
  | "high-rows"
  | "frequent"
  | "write-heavy";

export const TAG_META: Record<
  QueryTag,
  { label: string; variant: BadgeVariant }
> = {
  slow: { label: "Slow", variant: "warning" },
  "very-slow": { label: "Very slow", variant: "error" },
  inconsistent: { label: "Inconsistent", variant: "purple" },
  "low-cache": { label: "Low cache", variant: "warning" },
  "high-rows": { label: "High rows", variant: "orange" },
  frequent: { label: "Frequent", variant: "info" },
  "write-heavy": { label: "Write heavy", variant: "purple" },
};
