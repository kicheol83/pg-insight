import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn, fmtMs } from "@/lib/format";
import { severityBadge } from "@/lib/colors";
import type { BlockingChain } from "@/types/model";
import { useI18n, type MessageKey } from "@/i18n";

const SEVERITY_LABEL: Record<string, MessageKey> = {
  critical: "locks.severity.critical",
  high: "locks.severity.high",
  medium: "locks.severity.medium",
  low: "locks.severity.low",
};

export function BlockingChainCard({ chain }: { chain: BlockingChain }) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useI18n();

  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden",
        chain.severity === "critical"
          ? "border-red-300 dark:border-red-500/40"
          : chain.severity === "high"
            ? "border-orange-300 dark:border-orange-500/40"
            : "border-[var(--border)]",
      )}
    >
      <button
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-[var(--bg-hover)] transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="mt-0.5">
          {expanded ? (
            <ChevronDown size={14} className="text-muted" />
          ) : (
            <ChevronRight size={14} className="text-muted" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-red-400">
              {t("locks.blocker")}
            </span>
            <span className="text-xs text-muted mono">
              PID {chain.blockerPid}
            </span>
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
                severityBadge(chain.severity),
              )}
            >
              {SEVERITY_LABEL[chain.severity]
                ? t(SEVERITY_LABEL[chain.severity])
                : chain.severity}
            </span>
            <span className="text-xs text-muted ml-auto">
              {fmtMs(chain.blockerQueryMs)}
            </span>
          </div>
          <div className="text-xs mono text-secondary truncate">
            {chain.blockerQuery}
          </div>
          <div className="flex gap-3 mt-1">
            {chain.lockedRelation && (
              <span className="text-[10px] text-muted">
                {t("locks.table")}{" "}
                <span className="mono text-secondary">
                  {chain.lockedRelation}
                </span>
              </span>
            )}
            <span className="text-[10px] text-muted">
              {t("locks.lock")}{" "}
              <span className="text-secondary">{chain.lockMode}</span>
            </span>
            <span className="text-[10px] text-yellow-400">
              {t(
                chain.waiters.length === 1
                  ? "locks.waiterOne"
                  : "locks.waiterMany",
                { count: chain.waiters.length },
              )}
            </span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--border)] bg-[var(--bg-subtle)]">
          {chain.waiters.map((w, i) => (
            <div
              key={w.waiterPid}
              className={cn(
                "flex gap-3 p-3",
                i > 0 && "border-t border-[var(--border)]",
              )}
            >
              <div className="pl-5 shrink-0">
                <div className="text-[10px] font-bold text-yellow-400">
                  {t("locks.waiting")}
                </div>
                <div className="text-[10px] text-muted mono">
                  PID {w.waiterPid}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs mono text-secondary truncate mb-0.5">
                  {w.waiterQuery}
                </div>
                <div className="flex gap-3">
                  <span className="text-[10px] text-muted">
                    {t("locks.wants")}{" "}
                    <span className="text-secondary">{w.lockMode}</span>
                  </span>
                  <span className="text-[10px] text-red-400 font-medium">
                    {t("locks.waitingFor", { duration: fmtMs(w.waitMs) })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
