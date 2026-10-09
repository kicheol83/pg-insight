import {
  Trash2,
  RefreshCw,
  AlertTriangle,
  Clock,
  Settings2,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/layout/AppLayout";
import {
  Card,
  CardHeader,
  Badge,
  Button,
  StatBox,
  EmptyState,
  ProgressBar,
  DataTable,
  TargetSelector,
} from "@/components/ui";
import { useQuery } from "@/hooks/useQuery";
import { useActiveTarget } from "@/store/app";
import { liveApi, metricsApi } from "@/api/endpoints";
import { fmtXidAge, tickTime, cn } from "@/lib/format";
import { xidAgeColor, severityBadge } from "@/lib/colors";
import { XidAgeGauge } from "./XidAgeGauge";
import { useI18n, type MessageKey } from "@/i18n";

const AGE_STATUS_LABELS: Record<
  "warning" | "critical" | "emergency",
  MessageKey
> = {
  warning: "vacuum.ageStatus.warning",
  critical: "vacuum.ageStatus.critical",
  emergency: "vacuum.ageStatus.emergency",
};

export default function VacuumPage() {
  const { activeTargetId } = useActiveTarget();
  const { t } = useI18n();

  const { data, loading, refetch } = useQuery(
    () => liveApi.vacuumProgress(activeTargetId ?? ""),
    { refreshInterval: 10_000, enabled: !!activeTargetId },
  );
  const { data: xidTrend } = useQuery(
    () => metricsApi.xidAgeTrend(activeTargetId ?? "", 24),
    { refreshInterval: 300_000, enabled: !!activeTargetId },
  );

  return (
    <>
      <TopBar
        title={t("vacuum.title")}
        subtitle={t("vacuum.subtitle")}
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
          {data?.hasXidRisk && (
            <Badge variant="error" size="sm" dot>
              {t("vacuum.xidRisk")}
            </Badge>
          )}
          {!data?.settings?.autovacuumEnabled && data && (
            <Badge variant="error" size="sm">
              <AlertTriangle size={11} /> {t("vacuum.autovacuumDisabled")}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
          <Card>
            <CardHeader
              title={t("vacuum.dbXidAge")}
              subtitle={t("vacuum.dbXidAgeSubtitle")}
              icon={<Clock size={15} />}
            />
            {loading && !data ? (
              <div className="h-24 skeleton rounded" />
            ) : (
              <XidAgeGauge age={data?.databaseAge ?? 0} />
            )}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="p-2.5 bg-[var(--bg-subtle)] rounded-lg">
                <div className="text-[10px] text-muted mb-1">
                  {t("vacuum.maxTableXidAge")}
                </div>
                <div
                  className={cn(
                    "text-sm font-bold",
                    xidAgeColor(data?.maxXidAge ?? 0),
                  )}
                >
                  {fmtXidAge(data?.maxXidAge ?? 0)}
                </div>
              </div>
              <div className="p-2.5 bg-[var(--bg-subtle)] rounded-lg">
                <div className="text-[10px] text-muted mb-1">
                  {t("vacuum.freezeMaxAge")}
                </div>
                <div className="text-sm font-bold text-primary">
                  {fmtXidAge(
                    data?.settings?.autovacuumFreezeMaxAge ?? 200_000_000,
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title={t("vacuum.autovacuumStatus")}
              icon={<Settings2 size={15} />}
            />
            <div className="grid grid-cols-2 gap-3">
              <StatBox
                label={t("vacuum.workers")}
                value={`${data?.autovacuum?.activeWorkers ?? 0} / ${data?.autovacuum?.maxWorkers ?? 3}`}
                loading={loading && !data}
              />
              <StatBox
                label={t("vacuum.enabled")}
                value={
                  data?.settings?.autovacuumEnabled ? (
                    <span className="text-green-400">{t("vacuum.yes")}</span>
                  ) : (
                    <span className="text-red-400">{t("vacuum.no")}</span>
                  )
                }
                loading={loading && !data}
              />
              <StatBox
                label={t("vacuum.pendingVacuum")}
                value={data?.autovacuum?.tablesPendingVacuum ?? "—"}
                loading={loading && !data}
              />
              <StatBox
                label={t("vacuum.pendingAnalyze")}
                value={data?.autovacuum?.tablesPendingAnalyze ?? "—"}
                loading={loading && !data}
              />
            </div>
          </Card>
        </div>

        <Card className="mb-5">
          <CardHeader
            title={t("vacuum.xidTrend")}
            subtitle={t("vacuum.xidTrendSubtitle")}
            icon={<Clock size={15} />}
          />
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={xidTrend ?? []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="time"
                tickFormatter={tickTime}
                tick={{ fontSize: 10 }}
              />
              <YAxis
                tickFormatter={(v) => fmtXidAge(v)}
                tick={{ fontSize: 10 }}
                width={50}
              />
              <Tooltip formatter={(v: number) => fmtXidAge(v)} />
              <ReferenceLine
                y={200_000_000}
                stroke="#eab308"
                strokeDasharray="4 4"
                label={{
                  value: t("vacuum.freezeThreshold"),
                  fontSize: 10,
                  fill: "#eab308",
                }}
              />
              <ReferenceLine
                y={1_000_000_000}
                stroke="#ef4444"
                strokeDasharray="4 4"
                label={{
                  value: t("vacuum.danger"),
                  fontSize: 10,
                  fill: "#ef4444",
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#a855f7"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Card>
            <CardHeader
              title={t("vacuum.runningVacuums")}
              icon={<Trash2 size={15} />}
              action={
                (data?.activeVacuums?.length ?? 0) > 0 ? (
                  <Badge variant="info" size="xs" dot>
                    {t("vacuum.activeCount", {
                      count: data?.activeVacuums?.length ?? 0,
                    })}
                  </Badge>
                ) : null
              }
            />
            {!data?.activeVacuums?.length ? (
              <EmptyState
                icon={<Trash2 size={28} />}
                title={t("vacuum.noVacuums")}
                message={t("vacuum.noVacuumsMessage")}
              />
            ) : (
              <div className="space-y-3">
                {data.activeVacuums.map((v) => (
                  <div
                    key={v.pid}
                    className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)]"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="mono text-xs text-primary">
                        {v.schemaName}.{v.tableName}
                      </span>
                      <div className="flex gap-1.5">
                        {v.isAutovacuum && (
                          <Badge variant="info" size="xs">
                            {t("vacuum.auto")}
                          </Badge>
                        )}
                        <Badge variant="default" size="xs">
                          {v.phase}
                        </Badge>
                      </div>
                    </div>
                    <ProgressBar
                      value={v.progressPct}
                      size="sm"
                      colorFn={() => "#0ea5e9"}
                    />
                    <div className="flex justify-between mt-1 text-[10px] text-muted">
                      <span>PID {v.pid}</span>
                      <span>
                        {v.progressPct.toFixed(1)}% ·{" "}
                        {t("vacuum.blocks", {
                          scanned: v.heapBlksScanned,
                          total: v.heapBlksTotal,
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title={t("vacuum.atRiskTables")}
              subtitle={t("vacuum.sortedByXidAge")}
              icon={
                <AlertTriangle
                  size={15}
                  className={data?.xidAgeRisk?.length ? "text-red-400" : ""}
                />
              }
            />
            {!data?.xidAgeRisk?.length ? (
              <EmptyState
                icon={<Clock size={28} />}
                title={t("vacuum.noAtRisk")}
                message={t("vacuum.noAtRiskMessage")}
              />
            ) : (
              <DataTable
                data={data.xidAgeRisk}
                keyFn={(r) => `${r.schemaName}.${r.tableName}`}
                columns={[
                  {
                    key: "table",
                    header: t("vacuum.colTable"),
                    render: (r) => (
                      <span className="mono text-xs text-primary">
                        {r.schemaName}.{r.tableName}
                      </span>
                    ),
                  },
                  {
                    key: "age",
                    header: t("vacuum.colXidAge"),
                    width: "100px",
                    align: "right",
                    render: (r) => (
                      <span
                        className={cn("text-xs font-bold", xidAgeColor(r.age))}
                      >
                        {fmtXidAge(r.age)}
                      </span>
                    ),
                  },
                  {
                    key: "status",
                    header: t("vacuum.colStatus"),
                    width: "100px",
                    align: "right",
                    render: (r) => (
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
                          severityBadge(
                            r.ageStatus === "emergency"
                              ? "critical"
                              : r.ageStatus,
                          ),
                        )}
                      >
                        {t(AGE_STATUS_LABELS[r.ageStatus])}
                      </span>
                    ),
                  },
                ]}
              />
            )}
          </Card>
        </div>
      </PageContent>
    </>
  );
}
