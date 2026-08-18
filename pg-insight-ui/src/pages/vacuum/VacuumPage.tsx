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

export default function VacuumPage() {
  const { activeTargetId } = useActiveTarget();

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
        title="Vacuum & XID"
        subtitle="Autovacuum health & transaction ID wraparound prevention"
        actions={
          <Button
            size="sm"
            variant="ghost"
            icon={<RefreshCw size={13} />}
            onClick={refetch}
            loading={loading}
          >
            Refresh
          </Button>
        }
      />
      <PageContent>
        <div className="flex items-center gap-3 mb-5">
          <TargetSelector />
          {data?.hasXidRisk && (
            <Badge variant="error" size="sm" dot>
              XID wraparound risk!
            </Badge>
          )}
          {!data?.settings?.autovacuumEnabled && data && (
            <Badge variant="error" size="sm">
              <AlertTriangle size={11} /> Autovacuum disabled globally
            </Badge>
          )}
        </div>

        {/* XID gauge + autovacuum status */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
          <Card>
            <CardHeader
              title="Database XID age"
              subtitle="Transaction wraparound proximity — VACUUM FREEZE resets this"
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
                  Max table XID age
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
                  Freeze max age
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
              title="Autovacuum status"
              icon={<Settings2 size={15} />}
            />
            <div className="grid grid-cols-2 gap-3">
              <StatBox
                label="Workers"
                value={`${data?.autovacuum?.activeWorkers ?? 0} / ${data?.autovacuum?.maxWorkers ?? 3}`}
                loading={loading && !data}
              />
              <StatBox
                label="Enabled"
                value={
                  data?.settings?.autovacuumEnabled ? (
                    <span className="text-green-400">Yes</span>
                  ) : (
                    <span className="text-red-400">No</span>
                  )
                }
                loading={loading && !data}
              />
              <StatBox
                label="Pending vacuum"
                value={data?.autovacuum?.tablesPendingVacuum ?? "—"}
                loading={loading && !data}
              />
              <StatBox
                label="Pending analyze"
                value={data?.autovacuum?.tablesPendingAnalyze ?? "—"}
                loading={loading && !data}
              />
            </div>
          </Card>
        </div>

        {/* XID trend */}
        <Card className="mb-5">
          <CardHeader
            title="XID age trend (24h)"
            subtitle="Watch for continuous growth without drops — drops mean successful freeze"
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
                  value: "freeze threshold",
                  fontSize: 10,
                  fill: "#eab308",
                }}
              />
              <ReferenceLine
                y={1_000_000_000}
                stroke="#ef4444"
                strokeDasharray="4 4"
                label={{ value: "danger", fontSize: 10, fill: "#ef4444" }}
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
          {/* Active vacuums */}
          <Card>
            <CardHeader
              title="Running vacuums"
              icon={<Trash2 size={15} />}
              action={
                (data?.activeVacuums?.length ?? 0) > 0 ? (
                  <Badge variant="info" size="xs" dot>
                    {data?.activeVacuums?.length} active
                  </Badge>
                ) : null
              }
            />
            {!data?.activeVacuums?.length ? (
              <EmptyState
                icon={<Trash2 size={28} />}
                title="No vacuums running"
                message="Active VACUUM operations will appear here with live progress"
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
                            auto
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
                        {v.progressPct.toFixed(1)}% · {v.heapBlksScanned}/
                        {v.heapBlksTotal} blocks
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* At-risk tables */}
          <Card>
            <CardHeader
              title="Tables at wraparound risk"
              subtitle="Sorted by XID age"
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
                title="No at-risk tables"
                message="All tables are well within safe XID range"
              />
            ) : (
              <DataTable
                data={data.xidAgeRisk}
                keyFn={(t) => `${t.schemaName}.${t.tableName}`}
                columns={[
                  {
                    key: "table",
                    header: "Table",
                    render: (t) => (
                      <span className="mono text-xs text-primary">
                        {t.schemaName}.{t.tableName}
                      </span>
                    ),
                  },
                  {
                    key: "age",
                    header: "XID age",
                    width: "100px",
                    align: "right",
                    render: (t) => (
                      <span
                        className={cn("text-xs font-bold", xidAgeColor(t.age))}
                      >
                        {fmtXidAge(t.age)}
                      </span>
                    ),
                  },
                  {
                    key: "status",
                    header: "Status",
                    width: "100px",
                    align: "right",
                    render: (t) => (
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
                          severityBadge(
                            t.ageStatus === "emergency"
                              ? "critical"
                              : t.ageStatus,
                          ),
                        )}
                      >
                        {t.ageStatus}
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
