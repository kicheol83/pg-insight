import {
  ListChecks,
  RefreshCw,
  Layers,
  Copy,
  BarChart3,
  Boxes,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/layout/AppLayout";
import {
  Card,
  CardHeader,
  Badge,
  Button,
  ProgressBar,
  EmptyState,
  TargetSelector,
} from "@/components/ui";
import { useQuery } from "@/hooks/useQuery";
import { useActiveTarget } from "@/store/app";
import { liveApi } from "@/api/endpoints";
import { fmtBytes, fmtNum } from "@/lib/format";
import { useI18n } from "@/i18n";

function ProgressRow({
  title,
  subtitle,
  pct,
  badge,
  detail,
}: {
  title: string;
  subtitle: string;
  pct: number;
  badge?: string;
  detail: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)]">
      <div className="flex items-center justify-between mb-2">
        <span className="mono text-xs text-primary">{title}</span>
        {badge && (
          <Badge variant="info" size="xs">
            {badge}
          </Badge>
        )}
      </div>
      <ProgressBar value={pct} size="sm" colorFn={() => "#0ea5e9"} />
      <div className="flex justify-between mt-1.5 text-[10px] text-muted">
        <span>{subtitle}</span>
        <span>
          {pct.toFixed(1)}% · {detail}
        </span>
      </div>
    </div>
  );
}

export default function JobProgressPage() {
  const { activeTargetId } = useActiveTarget();
  const { t } = useI18n();

  const { data, loading, refetch, updatedAt } = useQuery(
    () => liveApi.jobProgress(activeTargetId ?? ""),
    { refreshInterval: 5_000, enabled: !!activeTargetId },
  );

  if (!activeTargetId) {
    return (
      <>
        <TopBar
          title={t("nav.jobProgress")}
          subtitle={t("jobProgress.subtitle")}
        />
        <PageContent>
          <div className="flex items-center gap-3 mb-5">
            <TargetSelector />
          </div>
          <EmptyState
            icon={<ListChecks size={32} />}
            title={t("jobProgress.noTarget")}
          />
        </PageContent>
      </>
    );
  }

  return (
    <>
      <TopBar
        title={t("nav.jobProgress")}
        subtitle={
          updatedAt
            ? t("jobProgress.refreshInterval")
            : t("jobProgress.subtitle")
        }
        actions={
          <Button
            size="sm"
            variant="ghost"
            icon={<RefreshCw size={13} />}
            onClick={refetch}
            loading={loading}
          >
            {t("common.refresh")}
          </Button>
        }
      />
      <PageContent>
        <div className="flex items-center gap-3 mb-5">
          <TargetSelector />
          {(data?.totalActive ?? 0) > 0 && (
            <Badge variant="info" size="sm" dot>
              {t("jobProgress.activeCount", { count: data?.totalActive ?? 0 })}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Card>
            <CardHeader
              title="CREATE INDEX"
              subtitle={t("jobProgress.createIndexSubtitle")}
              icon={<Layers size={15} />}
              action={
                data?.createIndex.length ? (
                  <Badge variant="info" size="xs">
                    {data.createIndex.length}
                  </Badge>
                ) : null
              }
            />
            {!data?.createIndex.length ? (
              <EmptyState
                icon={<Layers size={24} />}
                title={t("jobProgress.noActive")}
                message={t("jobProgress.noCreateIndexMessage")}
              />
            ) : (
              <div className="space-y-2.5">
                {data.createIndex.map((p) => (
                  <ProgressRow
                    key={p.pid}
                    title={`${p.schemaName}.${p.tableName}`}
                    subtitle={p.phase}
                    pct={p.progressPct}
                    badge={
                      p.command.includes("CONCURRENTLY")
                        ? "CONCURRENTLY"
                        : undefined
                    }
                    detail={t("jobProgress.blocks", {
                      done: fmtNum(p.blocksDone),
                      total: fmtNum(p.blocksTotal),
                    })}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="CLUSTER / VACUUM FULL"
              subtitle={t("jobProgress.clusterSubtitle")}
              icon={<Boxes size={15} />}
              action={
                data?.cluster.length ? (
                  <Badge variant="warning" size="xs">
                    {data.cluster.length}
                  </Badge>
                ) : null
              }
            />
            {!data?.cluster.length ? (
              <EmptyState
                icon={<Boxes size={24} />}
                title={t("jobProgress.noActive")}
              />
            ) : (
              <div className="space-y-2.5">
                {data.cluster.map((p) => (
                  <ProgressRow
                    key={p.pid}
                    title={`${p.schemaName}.${p.tableName}`}
                    subtitle={p.phase}
                    pct={p.progressPct}
                    badge={p.command}
                    detail={t("jobProgress.blocks", {
                      done: fmtNum(p.heapBlksScanned),
                      total: fmtNum(p.heapBlksTotal),
                    })}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="ANALYZE"
              subtitle={t("jobProgress.analyzeSubtitle")}
              icon={<BarChart3 size={15} />}
              action={
                data?.analyze.length ? (
                  <Badge variant="info" size="xs">
                    {data.analyze.length}
                  </Badge>
                ) : null
              }
            />
            {!data?.analyze.length ? (
              <EmptyState
                icon={<BarChart3 size={24} />}
                title={t("jobProgress.noActive")}
              />
            ) : (
              <div className="space-y-2.5">
                {data.analyze.map((p) => (
                  <ProgressRow
                    key={p.pid}
                    title={`${p.schemaName}.${p.tableName}`}
                    subtitle={p.phase}
                    pct={p.progressPct}
                    detail={t("jobProgress.blocks", {
                      done: fmtNum(p.sampleBlksScanned),
                      total: fmtNum(p.sampleBlksTotal),
                    })}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="COPY"
              subtitle={t("jobProgress.copySubtitle")}
              icon={<Copy size={15} />}
              action={
                data?.copy.length ? (
                  <Badge variant="info" size="xs">
                    {data.copy.length}
                  </Badge>
                ) : null
              }
            />
            {!data?.copy.length ? (
              <EmptyState
                icon={<Copy size={24} />}
                title={t("jobProgress.noActive")}
              />
            ) : (
              <div className="space-y-2.5">
                {data.copy.map((p) => (
                  <ProgressRow
                    key={p.pid}
                    title={
                      p.tableName
                        ? `${p.schemaName}.${p.tableName}`
                        : `PID ${p.pid}`
                    }
                    subtitle={`${p.command} (${p.type})`}
                    pct={p.progressPct}
                    detail={
                      p.bytesTotal > 0
                        ? `${fmtBytes(p.bytesProcessed)}/${fmtBytes(p.bytesTotal)}`
                        : t("jobProgress.rows", {
                            count: fmtNum(p.tuplesProcessed),
                          })
                    }
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      </PageContent>
    </>
  );
}
