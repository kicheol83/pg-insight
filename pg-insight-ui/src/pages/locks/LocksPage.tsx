import { Lock, AlertTriangle, RefreshCw, Skull } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/layout/AppLayout";
import {
  Card,
  CardHeader,
  Badge,
  Button,
  StatBox,
  EmptyState,
  LiveDot,
  TargetSelector,
} from "@/components/ui";
import { useQuery } from "@/hooks/useQuery";
import { useActiveTarget } from "@/store/app";
import { liveApi } from "@/api/endpoints";
import { fmtRelative } from "@/lib/format";
import { BlockingChainCard } from "./BlockingChainCard";

export default function LocksPage() {
  const { activeTargetId } = useActiveTarget();

  const {
    data: lockStats,
    loading: statsLoading,
    refetch,
    updatedAt,
  } = useQuery(() => liveApi.allLocks(activeTargetId ?? ""), {
    refreshInterval: 3_000,
    enabled: !!activeTargetId,
  });
  const { data: chains, loading: chainsLoading } = useQuery(
    () => liveApi.lockChains(activeTargetId ?? ""),
    { refreshInterval: 3_000, enabled: !!activeTargetId },
  );

  const sortedByMode = Object.entries(lockStats?.byMode ?? {}).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <>
      <TopBar
        title="Locks"
        subtitle={
          updatedAt
            ? `Updated ${fmtRelative(updatedAt)}`
            : "Live lock monitoring"
        }
        actions={
          <div className="flex items-center gap-2">
            <LiveDot size="xs" />
            <span className="text-xs text-muted">3s refresh</span>
            <Button
              size="sm"
              variant="ghost"
              icon={<RefreshCw size={13} />}
              onClick={refetch}
            >
              Refresh
            </Button>
          </div>
        }
      />
      <PageContent>
        <div className="flex items-center gap-3 mb-5">
          <TargetSelector />
          {chains?.hasCritical && (
            <Badge variant="error" size="sm" dot>
              Critical lock detected
            </Badge>
          )}
          {lockStats?.hasDeadlockRisk && (
            <Badge variant="error" size="sm">
              <Skull size={11} /> Deadlock risk
            </Badge>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          <Card padding="sm">
            <StatBox
              label="Total locks"
              value={lockStats?.totalLocks ?? "—"}
              icon={<Lock size={14} />}
              loading={statsLoading && !lockStats}
            />
          </Card>
          <Card
            padding="sm"
            className={
              lockStats?.waitingLocks
                ? "border-red-300 dark:border-red-500/40"
                : ""
            }
          >
            <StatBox
              label="Waiting locks"
              value={lockStats?.waitingLocks ?? "—"}
              icon={
                <AlertTriangle
                  size={14}
                  className={lockStats?.waitingLocks ? "text-red-400" : ""}
                />
              }
              loading={statsLoading && !lockStats}
            />
          </Card>
          <Card padding="sm">
            <StatBox
              label="Blocking chains"
              value={chains?.count ?? "—"}
              loading={chainsLoading && !chains}
            />
          </Card>
          <Card padding="sm">
            <StatBox
              label="Deadlocks (total)"
              value={lockStats?.deadlocksTotal ?? "—"}
              loading={statsLoading && !lockStats}
            />
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Chains */}
          <div className="xl:col-span-2">
            <Card>
              <CardHeader
                title="Blocking chains"
                subtitle="Who is blocking whom"
                icon={<Lock size={15} />}
                action={
                  chains?.chains?.length ? (
                    <Badge variant="error" size="xs">
                      {chains.chains.length}
                    </Badge>
                  ) : (
                    <Badge variant="success" size="xs">
                      None
                    </Badge>
                  )
                }
              />
              {chainsLoading && !chains ? (
                <div className="h-32 skeleton rounded" />
              ) : !chains?.chains?.length ? (
                <EmptyState
                  icon={<Lock size={28} />}
                  title="No blocking chains detected"
                  message="All connections are running freely"
                />
              ) : (
                <div className="space-y-3">
                  {chains.chains.map((chain) => (
                    <BlockingChainCard key={chain.blockerPid} chain={chain} />
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Lock modes */}
          <Card>
            <CardHeader title="Lock modes" icon={<Lock size={15} />} />
            {sortedByMode.length === 0 ? (
              <EmptyState title="No locks" />
            ) : (
              <div className="space-y-2">
                {sortedByMode.map(([mode, count]) => {
                  const max = sortedByMode[0]?.[1] ?? 1;
                  const color = mode.includes("Exclusive")
                    ? "#ef4444"
                    : mode.includes("Share")
                      ? "#eab308"
                      : "#22c55e";
                  return (
                    <div key={mode}>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-secondary truncate">
                          {mode}
                        </span>
                        <span className="text-xs font-bold text-primary ml-2">
                          {count}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700">
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{
                            width: `${(count / max) * 100}%`,
                            backgroundColor: color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </PageContent>
    </>
  );
}
