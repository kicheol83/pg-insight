import {
  HardDrive,
  RefreshCw,
  Info,
  ArrowDownToLine,
  ArrowUpFromLine,
  Maximize2,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/layout/AppLayout";
import {
  Card,
  CardHeader,
  Badge,
  Button,
  DataTable,
  ProgressBar,
  EmptyState,
  TargetSelector,
} from "@/components/ui";
import { useQuery } from "@/hooks/useQuery";
import { useActiveTarget } from "@/store/app";
import { liveApi } from "@/api/endpoints";
import { fmtNum, fmtMs, cn } from "@/lib/format";
import type { IoStatRow } from "@/types/model";
import { useI18n, type MessageKey } from "@/i18n";

const BACKEND_LABELS: Record<string, MessageKey> = {
  "client backend": "io.backend.clientBackend",
  "autovacuum worker": "io.backend.autovacuumWorker",
  "autovacuum launcher": "io.backend.autovacuumLauncher",
  "background writer": "io.backend.backgroundWriter",
  checkpointer: "io.backend.checkpointer",
  walwriter: "io.backend.walWriter",
  "standalone backend": "io.backend.standalone",
};

export default function IoMonitoringPage() {
  const { activeTargetId } = useActiveTarget();
  const { t } = useI18n();

  const { data, loading, refetch, updatedAt } = useQuery(
    () => liveApi.ioStats(activeTargetId ?? ""),
    { refreshInterval: 15_000, enabled: !!activeTargetId },
  );

  if (!activeTargetId) {
    return (
      <>
        <TopBar title={t("nav.io")} subtitle={t("io.subtitle")} />
        <PageContent>
          <div className="flex items-center gap-3 mb-5">
            <TargetSelector />
          </div>
          <EmptyState icon={<HardDrive size={32} />} title={t("io.noTarget")} />
        </PageContent>
      </>
    );
  }

  const maxByBackend = Math.max(
    1,
    ...(data?.byBackendType ?? []).map((b) => b.reads + b.writes),
  );

  return (
    <>
      <TopBar
        title={t("nav.io")}
        subtitle={updatedAt ? t("io.updatedJustNow") : t("io.subtitle")}
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
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <TargetSelector />
          {data && (
            <Badge
              variant={data.pgStatIoAvailable ? "info" : "default"}
              size="sm"
            >
              {data.pgStatIoAvailable
                ? t("io.pgStatIoFull")
                : t("io.simplifiedView")}
            </Badge>
          )}
          {data && !data.trackIoTimingEnabled && (
            <Badge variant="warning" size="xs">
              {t("io.trackIoTimingOff")}
            </Badge>
          )}
        </div>

        {data && !data.pgStatIoAvailable && (
          <Card className="mb-5 border-blue-300 dark:border-blue-500/40">
            <div className="flex items-start gap-3">
              <Info size={16} className="text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-primary">
                  {t("io.oldServerBefore")}{" "}
                  <code className="mono text-brand-500">pg_stat_io</code>{" "}
                  {t("io.oldServerAfter")}
                </p>
                <p className="text-xs text-secondary mt-1">
                  {t("io.fallbackBefore")}{" "}
                  <code className="mono text-brand-500">
                    pg_statio_user_tables
                  </code>{" "}
                  {t("io.fallbackAfter")}
                </p>
              </div>
            </div>
          </Card>
        )}

        {data?.pgStatIoAvailable ? (
          <>
            {/* Backend turi bo'yicha xulosa */}
            <Card className="mb-5">
              <CardHeader
                title={t("io.byBackendTitle")}
                subtitle={t("io.byBackendSubtitle")}
                icon={<HardDrive size={15} />}
              />
              {!data.byBackendType?.length ? (
                <EmptyState
                  title={t("io.noActivity")}
                  message={t("io.noActivityMessage")}
                />
              ) : (
                <div className="space-y-2.5">
                  {data.byBackendType.map((b) => (
                    <div
                      key={b.backendType}
                      className="flex items-center gap-3"
                    >
                      <div className="text-xs text-secondary w-40 shrink-0 truncate">
                        {BACKEND_LABELS[b.backendType]
                          ? t(BACKEND_LABELS[b.backendType])
                          : b.backendType}
                      </div>
                      <div className="flex-1">
                        <ProgressBar
                          value={b.reads + b.writes}
                          max={maxByBackend}
                          size="sm"
                          colorFn={() => "#0ea5e9"}
                        />
                      </div>
                      <div className="flex gap-3 text-xs w-32 justify-end shrink-0">
                        <span className="text-blue-400 flex items-center gap-1">
                          <ArrowDownToLine size={10} />
                          {fmtNum(b.reads)}
                        </span>
                        <span className="text-orange-400 flex items-center gap-1">
                          <ArrowUpFromLine size={10} />
                          {fmtNum(b.writes)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Batafsil jadval */}
            <Card>
              <CardHeader
                title={t("io.detailTitle")}
                subtitle={t("io.detailSubtitle")}
                icon={<HardDrive size={15} />}
              />
              <DataTable<IoStatRow>
                loading={loading && !data}
                data={data.rows ?? []}
                keyFn={(r, i) =>
                  `${r.backendType}-${r.object}-${r.context}-${i}`
                }
                emptyMsg={t("io.noActivity")}
                columns={[
                  {
                    key: "backend",
                    header: t("io.colBackend"),
                    render: (r) => (
                      <span className="text-xs text-primary">
                        {BACKEND_LABELS[r.backendType]
                          ? t(BACKEND_LABELS[r.backendType])
                          : r.backendType}
                      </span>
                    ),
                  },
                  {
                    key: "object",
                    header: t("io.colObject"),
                    width: "110px",
                    render: (r) => (
                      <span className="text-xs text-secondary">{r.object}</span>
                    ),
                  },
                  {
                    key: "context",
                    header: t("io.colContext"),
                    width: "100px",
                    render: (r) => (
                      <Badge variant="default" size="xs">
                        {r.context}
                      </Badge>
                    ),
                  },
                  {
                    key: "reads",
                    header: t("io.colReads"),
                    width: "80px",
                    align: "right",
                    render: (r) => (
                      <span className="text-xs mono text-blue-400 font-medium">
                        {fmtNum(r.reads)}
                      </span>
                    ),
                  },
                  {
                    key: "writes",
                    header: t("io.colWrites"),
                    width: "80px",
                    align: "right",
                    render: (r) => (
                      <span className="text-xs mono text-orange-400 font-medium">
                        {fmtNum(r.writes)}
                      </span>
                    ),
                  },
                  {
                    key: "extends",
                    header: t("io.colExtends"),
                    width: "80px",
                    align: "right",
                    render: (r) => (
                      <span className="text-xs mono text-secondary">
                        {fmtNum(r.extends)}
                      </span>
                    ),
                  },
                  {
                    key: "hits",
                    header: t("io.colHits"),
                    width: "80px",
                    align: "right",
                    render: (r) => (
                      <span className="text-xs mono text-green-400">
                        {fmtNum(r.hits)}
                      </span>
                    ),
                  },
                  {
                    key: "evictions",
                    header: t("io.colEvictions"),
                    width: "90px",
                    align: "right",
                    render: (r) => (
                      <span
                        className={cn(
                          "text-xs mono",
                          r.evictions > 1000
                            ? "text-yellow-400"
                            : "text-secondary",
                        )}
                      >
                        {fmtNum(r.evictions)}
                      </span>
                    ),
                  },
                  {
                    key: "time",
                    header: t("io.colTime"),
                    width: "130px",
                    align: "right",
                    render: (r) =>
                      data.trackIoTimingEnabled ? (
                        <span className="text-xs text-muted">
                          {fmtMs(r.readTimeMs)} / {fmtMs(r.writeTimeMs)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      ),
                  },
                ]}
              />
            </Card>
          </>
        ) : (
          <Card>
            <CardHeader
              title={t("io.fallbackTitle")}
              icon={<Maximize2 size={15} />}
            />
            {!data?.fallback ? (
              <EmptyState title={t("common.noData")} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-[var(--bg-subtle)] rounded-lg">
                  <div className="text-xs text-muted mb-2">{t("io.heap")}</div>
                  <div className="flex justify-between text-sm">
                    <span className="text-secondary">
                      {t("io.readFromDisk")}
                    </span>
                    <span className="text-primary font-medium">
                      {fmtNum(data.fallback.heapBlksRead)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-secondary">
                      {t("io.hitFromCache")}
                    </span>
                    <span className="text-green-400 font-medium">
                      {fmtNum(data.fallback.heapBlksHit)}
                    </span>
                  </div>
                </div>
                <div className="p-4 bg-[var(--bg-subtle)] rounded-lg">
                  <div className="text-xs text-muted mb-2">{t("io.index")}</div>
                  <div className="flex justify-between text-sm">
                    <span className="text-secondary">
                      {t("io.readFromDisk")}
                    </span>
                    <span className="text-primary font-medium">
                      {fmtNum(data.fallback.idxBlksRead)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-secondary">
                      {t("io.hitFromCache")}
                    </span>
                    <span className="text-green-400 font-medium">
                      {fmtNum(data.fallback.idxBlksHit)}
                    </span>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-xs text-muted mb-1.5">
                    {t("io.overallCacheHit")}
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "text-2xl font-bold tabular-nums",
                        data.fallback.cacheHitRatio < 0.9
                          ? "text-red-400"
                          : "text-green-400",
                      )}
                    >
                      {(data.fallback.cacheHitRatio * 100).toFixed(1)}%
                    </span>
                    <ProgressBar
                      value={data.fallback.cacheHitRatio * 100}
                      size="md"
                      className="flex-1"
                      colorFn={(pct) =>
                        pct < 90 ? "#ef4444" : pct < 98 ? "#eab308" : "#22c55e"
                      }
                    />
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}
      </PageContent>
    </>
  );
}
