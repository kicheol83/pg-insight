import { useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Wifi,
  Zap,
  Lock,
  Database,
  Activity,
  GitBranch,
  Trash2,
  RefreshCw,
  Clock,
  TrendingUp,
  HardDrive,
  AlertTriangle,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/layout/AppLayout";
import {
  Card,
  CardHeader,
  StatBox,
  Badge,
  Button,
  Skeleton,
  EmptyState,
  LiveDot,
  ProgressBar,
  TargetSelector,
} from "@/components/ui";
import { useQuery } from "@/hooks/useQuery";
import { useActiveTarget } from "@/store/app";
import { metricsApi } from "@/api/endpoints";
import {
  fmtMs,
  fmtBytes,
  fmtNum,
  fmtXidAge,
  fmtRelative,
  tickTime,
  cn,
} from "@/lib/format";
import {
  utilizationColor,
  utilizationBarColor,
  xidAgeColor,
  lagColor,
} from "@/lib/colors";

export default function DashboardPage() {
  const { activeTargetId } = useActiveTarget();
  const [timeRange, setTimeRange] = useState<1 | 6 | 24>(1);

  const {
    data: summary,
    loading,
    refetch,
    updatedAt,
  } = useQuery(() => metricsApi.dashboard(activeTargetId ?? ""), {
    refreshInterval: 15_000,
    enabled: !!activeTargetId,
  });
  const { data: connTrend } = useQuery(
    () =>
      metricsApi.connectionTrend(
        activeTargetId ?? "",
        timeRange,
        timeRange === 1 ? 1 : timeRange === 6 ? 5 : 30,
      ),
    { refreshInterval: 30_000, enabled: !!activeTargetId },
  );
  const { data: lockTrend } = useQuery(
    () => metricsApi.lockTrend(activeTargetId ?? "", Math.min(timeRange, 6)),
    { refreshInterval: 30_000, enabled: !!activeTargetId },
  );
  const { data: cacheHitTrend } = useQuery(
    () => metricsApi.cacheHitTrend(activeTargetId ?? "", timeRange),
    { refreshInterval: 60_000, enabled: !!activeTargetId },
  );
  const { data: connByApp } = useQuery(
    () => metricsApi.connectionsByApp(activeTargetId ?? ""),
    { refreshInterval: 30_000, enabled: !!activeTargetId },
  );
  const { data: bloatTop } = useQuery(
    () => metricsApi.tableBloatTop(activeTargetId ?? ""),
    { refreshInterval: 120_000, enabled: !!activeTargetId },
  );

  if (!activeTargetId) {
    return (
      <>
        <TopBar title="Dashboard" subtitle="Real-time PostgreSQL overview" />
        <PageContent>
          <div className="flex items-center gap-3 mb-5">
            <TargetSelector />
          </div>
          <div className="flex flex-col items-center justify-center h-96 gap-6">
            <div className="w-16 h-16 rounded-2xl bg-brand-500/10 flex items-center justify-center">
              <Database size={32} className="text-brand-500" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold text-primary mb-2">
                No target selected
              </h2>
              <p className="text-sm text-muted max-w-sm">
                Add a PostgreSQL target to start monitoring your database in
                real-time.
              </p>
            </div>
          </div>
        </PageContent>
      </>
    );
  }

  const conn = summary?.connections;

  return (
    <>
      <TopBar
        title="Dashboard"
        subtitle={
          updatedAt ? `Updated ${fmtRelative(updatedAt)}` : "Connecting…"
        }
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
          <div className="flex gap-1 ml-auto border border-[var(--border)] rounded-lg p-0.5">
            {([1, 6, 24] as const).map((h) => (
              <button
                key={h}
                onClick={() => setTimeRange(h)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-md font-medium transition-colors",
                  timeRange === h
                    ? "bg-[var(--bg-hover)] text-primary"
                    : "text-muted hover:text-primary",
                )}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Wifi size={16} className="text-blue-500" />
              </div>
              <LiveDot size="xs" />
            </div>
            <StatBox
              label="Connections"
              value={
                loading ? (
                  <Skeleton className="h-8 w-16 rounded" />
                ) : (
                  fmtNum(conn?.total ?? 0)
                )
              }
              sub={
                conn ? (
                  <ProgressBar
                    value={conn.utilizationPct}
                    size="xs"
                    className="mt-2"
                    colorFn={utilizationBarColor}
                  />
                ) : null
              }
            />
            <div className="flex gap-2 mt-2">
              <span className="text-xs text-muted">
                Active:{" "}
                <span className="text-green-400 font-medium">
                  {conn?.active ?? 0}
                </span>
              </span>
              <span className="text-xs text-muted">
                Idle:{" "}
                <span className="text-secondary font-medium">
                  {conn?.idle ?? 0}
                </span>
              </span>
            </div>
          </Card>

          <Card
            className={cn(
              "border-l-4",
              (conn?.utilizationPct ?? 0) >= 90
                ? "border-l-red-400"
                : (conn?.utilizationPct ?? 0) >= 75
                  ? "border-l-yellow-400"
                  : "border-l-green-400",
            )}
          >
            <StatBox
              label="Pool usage"
              value={
                loading ? (
                  <Skeleton className="h-8 w-16 rounded" />
                ) : (
                  `${conn?.utilizationPct?.toFixed(0) ?? 0}%`
                )
              }
              icon={<Activity size={14} />}
              sub={
                <span className={utilizationColor(conn?.utilizationPct ?? 0)}>
                  {(conn?.utilizationPct ?? 0) >= 90
                    ? "Critical"
                    : (conn?.utilizationPct ?? 0) >= 75
                      ? "High"
                      : "Normal"}
                </span>
              }
            />
            <div className="text-xs text-muted mt-2">
              Max: {conn?.maxConnections ?? "—"}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-yellow-500/10 rounded-lg">
                <Zap size={16} className="text-yellow-500" />
              </div>
              {(summary?.slowQueriesCount ?? 0) > 0 && (
                <Badge variant="warning" size="xs" dot>
                  {summary?.slowQueriesCount} slow
                </Badge>
              )}
            </div>
            <StatBox
              label="Slow queries (1h)"
              value={
                loading ? (
                  <Skeleton className="h-8 w-12 rounded" />
                ) : (
                  fmtNum(summary?.slowQueriesCount ?? 0)
                )
              }
            />
            <div className="text-xs text-muted mt-2">
              Cache hit:{" "}
              <span
                className={
                  summary?.avgCacheHitRatio && summary.avgCacheHitRatio < 0.9
                    ? "text-yellow-400"
                    : "text-green-400"
                }
              >
                {summary?.avgCacheHitRatio
                  ? `${(summary.avgCacheHitRatio * 100).toFixed(1)}%`
                  : "—"}
              </span>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <Lock size={16} className="text-red-400" />
              </div>
              {(summary?.lockWaitsCount ?? 0) > 0 && (
                <Badge variant="error" size="xs" dot>
                  {summary?.lockWaitsCount} waiting
                </Badge>
              )}
            </div>
            <StatBox
              label="Lock waits (1h)"
              value={
                loading ? (
                  <Skeleton className="h-8 w-12 rounded" />
                ) : (
                  fmtNum(summary?.lockWaitsCount ?? 0)
                )
              }
            />
            <div className="text-xs text-muted mt-2">
              Deadlocks:{" "}
              <span className="text-secondary">
                {summary?.deadlocksTotal ?? 0}
              </span>
            </div>
          </Card>
        </div>

        {/* Health indicators */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
          <Card padding="sm" className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg shrink-0">
              <Clock size={15} className="text-purple-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-muted mb-0.5">XID Age</div>
              <div
                className={cn(
                  "text-sm font-bold",
                  xidAgeColor(summary?.maxXidAge ?? 0),
                )}
              >
                {loading ? "—" : fmtXidAge(summary?.maxXidAge ?? 0)}
              </div>
              {summary?.hasXidRisk && (
                <Badge variant="error" size="xs" className="mt-1">
                  Risk
                </Badge>
              )}
            </div>
          </Card>
          <Card padding="sm" className="flex items-center gap-3">
            <div className="p-2 bg-teal-500/10 rounded-lg shrink-0">
              <GitBranch size={15} className="text-teal-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-muted mb-0.5">Replication lag</div>
              <div
                className={cn(
                  "text-sm font-bold",
                  lagColor((summary?.replicationLagMb ?? 0) * 1024 * 1024),
                )}
              >
                {loading
                  ? "—"
                  : summary?.replicationLagMb === null
                    ? "Not replicating"
                    : `${summary?.replicationLagMb ?? 0} MB`}
              </div>
            </div>
          </Card>
          <Card padding="sm" className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/10 rounded-lg shrink-0">
              <Trash2 size={15} className="text-orange-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-muted mb-0.5">Active vacuums</div>
              <div className="text-sm font-bold text-primary">
                {loading ? "—" : (summary?.activeVacuums ?? 0)}
              </div>
            </div>
          </Card>
          <Card padding="sm" className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg shrink-0">
              <TrendingUp size={15} className="text-blue-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-muted mb-0.5">Longest query</div>
              <div className="text-sm font-bold text-primary">
                {loading ? "—" : fmtMs(conn?.longestQueryMs ?? 0)}
              </div>
            </div>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
          <Card>
            <CardHeader
              title="Connection trend"
              subtitle={`Last ${timeRange}h`}
              icon={<Wifi size={15} />}
            />
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={connTrend ?? []}>
                <defs>
                  <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="time"
                  tickFormatter={tickTime}
                  tick={{ fontSize: 11 }}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="total"
                  name="Total"
                  stroke="#0ea5e9"
                  fill="url(#gTotal)"
                  strokeWidth={1.5}
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="active"
                  name="Active"
                  stroke="#22c55e"
                  fill="none"
                  strokeWidth={1.5}
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="idleInTx"
                  name="Idle in tx"
                  stroke="#ef4444"
                  fill="none"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <CardHeader
              title="Lock wait events"
              subtitle={`Last ${Math.min(timeRange, 6)}h`}
              icon={<Lock size={15} />}
            />
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={lockTrend ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="time"
                  tickFormatter={tickTime}
                  tick={{ fontSize: 11 }}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar
                  dataKey="waitingLocks"
                  name="Waiting"
                  fill="#ef4444"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <CardHeader
              title="Buffer cache hit ratio"
              subtitle="Target: > 99%"
              icon={<HardDrive size={15} />}
            />
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={cacheHitTrend ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="time"
                  tickFormatter={tickTime}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  domain={[0.8, 1]}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="value"
                  name="Cache hit"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <CardHeader
              title="Connections by application"
              subtitle="Current snapshot"
              icon={<Database size={15} />}
            />
            {!connByApp?.length ? (
              <EmptyState
                title="No data"
                message="Connection data will appear here"
              />
            ) : (
              <div className="space-y-2 mt-2">
                {(connByApp ?? []).slice(0, 8).map((app) => {
                  const maxCount = (connByApp ?? [])[0]?.count ?? 1;
                  return (
                    <div key={app.appName} className="flex items-center gap-3">
                      <div
                        className="text-xs text-secondary truncate min-w-0 w-36"
                        title={app.appName}
                      >
                        {app.appName}
                      </div>
                      <div className="flex-1">
                        <ProgressBar
                          value={app.count}
                          max={maxCount}
                          size="sm"
                          colorFn={() => "#0ea5e9"}
                        />
                      </div>
                      <div className="text-xs mono text-primary w-8 text-right">
                        {app.count}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Table bloat */}
        {((
          bloatTop as Array<{
            tableName: string;
            bloatRatio: number;
            sizeBytes: number;
          }>
        )?.length ?? 0) > 0 && (
          <Card>
            <CardHeader
              title="Tables with highest bloat"
              subtitle="Dead tuples ratio — run VACUUM to reclaim space"
              icon={<AlertTriangle size={15} className="text-yellow-400" />}
            />
            <div className="space-y-2">
              {(
                bloatTop as Array<{
                  tableName: string;
                  bloatRatio: number;
                  sizeBytes: number;
                }>
              )
                .slice(0, 6)
                .map((t) => (
                  <div key={t.tableName} className="flex items-center gap-3">
                    <div className="mono text-xs text-secondary truncate min-w-0 w-48">
                      {t.tableName}
                    </div>
                    <div className="flex-1">
                      <ProgressBar
                        value={t.bloatRatio * 100}
                        size="sm"
                        colorFn={(pct) =>
                          pct >= 40
                            ? "#ef4444"
                            : pct >= 20
                              ? "#eab308"
                              : "#22c55e"
                        }
                      />
                    </div>
                    <div
                      className={cn(
                        "text-xs font-bold w-12 text-right",
                        t.bloatRatio >= 0.4
                          ? "text-red-400"
                          : t.bloatRatio >= 0.2
                            ? "text-yellow-400"
                            : "text-green-400",
                      )}
                    >
                      {(t.bloatRatio * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted w-20 text-right">
                      {fmtBytes(t.sizeBytes)}
                    </div>
                  </div>
                ))}
            </div>
          </Card>
        )}
      </PageContent>
    </>
  );
}
