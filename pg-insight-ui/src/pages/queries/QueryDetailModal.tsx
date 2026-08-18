import { Hash } from "lucide-react";
import { Modal, Badge, CopyButton } from "@/components/ui";
import { fmtMs, fmtNum } from "@/lib/format";
import type { QueryStat } from "@/types/model";
import { TAG_META, type QueryTag } from "./queryTags";

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
  if (!query) return null;
  return (
    <Modal open={open} onClose={onClose} title="Query Details" size="xl">
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-secondary">
              Query (normalized)
            </span>
            <CopyButton text={query.queryText} />
          </div>
          <pre className="text-xs mono bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg p-3 overflow-auto max-h-40 text-secondary whitespace-pre-wrap">
            {query.queryText}
          </pre>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Calls", value: fmtNum(query.calls) },
            { label: "Mean time", value: fmtMs(query.meanTimeMs) },
            { label: "Max time", value: fmtMs(query.maxTimeMs) },
            { label: "Std dev", value: fmtMs(query.stddevTimeMs) },
            { label: "Total time", value: fmtMs(query.totalTimeMs) },
            { label: "Rows/call", value: fmtNum(query.rowsPerCall) },
            {
              label: "Cache hit",
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
                  {meta.label}
                </Badge>
              ) : null;
            })}
          </div>
        )}

        <div className="text-[10px] text-muted mono flex items-center gap-2">
          <Hash size={10} /> Query ID: {query.queryId}
        </div>
      </div>
    </Modal>
  );
}
