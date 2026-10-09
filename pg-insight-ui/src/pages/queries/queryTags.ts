import type { BadgeVariant } from "@/components/ui";
import type { MessageKey } from "@/i18n";

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
  { labelKey: MessageKey; variant: BadgeVariant }
> = {
  slow: { labelKey: "queries.tag.slow", variant: "warning" },
  "very-slow": { labelKey: "queries.tag.verySlow", variant: "error" },
  inconsistent: { labelKey: "queries.tag.inconsistent", variant: "purple" },
  "low-cache": { labelKey: "queries.tag.lowCache", variant: "warning" },
  "high-rows": { labelKey: "queries.tag.highRows", variant: "orange" },
  frequent: { labelKey: "queries.tag.frequent", variant: "info" },
  "write-heavy": { labelKey: "queries.tag.writeHeavy", variant: "purple" },
};
