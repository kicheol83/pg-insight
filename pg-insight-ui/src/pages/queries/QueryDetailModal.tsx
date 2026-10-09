import { Hash } from "lucide-react";
import { Modal, Badge, CopyButton } from "@/components/ui";
import { fmtMs, fmtNum } from "@/lib/format";
import type { QueryStat } from "@/types/model";
import { TAG_META, type QueryTag } from "./queryTags";
import { useI18n } from "@/i18n";

interface QueryDetailModalProps {
  query: QueryStat | null;
  open: boolean;
  onClose: () => void;
}

export function QueryDetailModal({
  query,
  open,
  onClose,
}: QueryDetailModalProps) {
  const { t } = useI18n();
  if (!query) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("queries.detailTitle")}
      size="xl"
    >
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-secondary">
              {t("queries.normalized")}
            </span>
            <CopyButton text={query.queryText} />
          </div>
          <pre className="text-xs mono bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg p-3 overflow-auto max-h-40 text-secondary whitespace-pre-wrap">
            {query.queryText}
          </pre>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: t("queries.calls"), value: fmtNum(query.calls) },
            { label: t("queries.meanTime"), value: fmtMs(query.meanTimeMs) },
            { label: t("queries.maxTime"), value: fmtMs(query.maxTimeMs) },
            { label: t("queries.stdDev"), value: fmtMs(query.stddevTimeMs) },
            { label: t("queries.totalTime"), value: fmtMs(query.totalTimeMs) },
            {
              label: t("queries.rowsPerCall"),
              value: fmtNum(query.rowsPerCall),
            },
            {
              label: t("queries.cacheHit"),
              value: `${(query.cacheHitRatio * 100).toFixed(1)}%`,
            },
          ].map((s) => (
            <div
              key={s.label}
              className="p-2.5 bg-[var(--bg-subtle)] rounded-lg"
            >
              <div className="text-[10px] text-muted mb-1">{s.label}</div>
              <div className="text-sm font-bold text-primary">{s.value}</div>
            </div>
          ))}
        </div>

        {query.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {query.tags.map((tag) => {
              const meta = TAG_META[tag as QueryTag];
              return meta ? (
                <Badge key={tag} variant={meta.variant} size="xs">
                  {t(meta.labelKey)}
                </Badge>
              ) : null;
            })}
          </div>
        )}

        <div className="text-[10px] text-muted mono flex items-center gap-2">
          <Hash size={10} /> {t("queries.queryId")}: {query.queryId}
        </div>
      </div>
    </Modal>
  );
}
