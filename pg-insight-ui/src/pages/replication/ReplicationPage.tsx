import {
  GitBranch,
  RefreshCw,
  Server,
  AlertTriangle,
  Database,
  Radio,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
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
  DataTable,
  TargetSelector,
} from "@/components/ui";
import { useQuery } from "@/hooks/useQuery";
import { useActiveTarget } from "@/store/app";
import { liveApi, metricsApi } from "@/api/endpoints";
import { fmtBytes, tickTime, cn } from "@/lib/format";
import { lagColor } from "@/lib/colors";
import { ReplicaCard } from "./ReplicaCard";
import type { ReplicationSlot } from "@/types/model";

export default function ReplicationPage() {
  const { activeTargetId } = useActiveTarget();

  const { data, loading, refetch } = useQuery(
    () => liveApi.replication(activeTargetId ?? ""),
    { refreshInterval: 5_000, enabled: !!activeTargetId },
  );
  const { data: lagTrend } = useQuery(
    () => metricsApi.replicationTrend(activeTargetId ?? "", 6),
    { refreshInterval: 60_000, enabled: !!activeTargetId },
  );

  return (
    <>
      <TopBar
        title="Replication"
        subtitle="Streaming replication & WAL health"
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
          {data && (
            <Badge variant={data.isPrimary ? "info" : "purple"} size="sm">
              {data.isPrimary ? "PRIMARY" : "REPLICA"}
            </Badge>
          )}
          {data?.hasLaggedReplicas && (
            <Badge variant="error" size="sm" dot>
              Replica lagging
            </Badge>
          )}
          {data?.hasInactiveSlots && (
            <Badge variant="warning" size="sm">
              <AlertTriangle size={11} /> Inactive slots retaining WAL
            </Badge>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          <Card padding="sm">
            <StatBox
              label="Replicas"
              value={data?.replicas?.length ?? "—"}
              icon={<Server size={13} />}
              loading={loading && !data}
            />
          </Card>
          <Card padding="sm">
            <StatBox
              label="Max lag"
              value={
                data ? (
                  <span className={lagColor(data.maxLagBytes)}>
                    {fmtBytes(data.maxLagBytes)}
                  </span>
                ) : (
                  "—"
                )
              }
              icon={<GitBranch size={13} />}
              loading={loading && !data}
            />
          </Card>
          <Card padding="sm">
            <StatBox
              label="WAL size"
              value={data ? fmtBytes(data.walSizeBytes) : "—"}
              icon={<Database size={13} />}
              loading={loading && !data}
            />
          </Card>
          <Card padding="sm">
            <StatBox
              label="Slots (WAL retained)"
              value={data?.slots?.length ?? "—"}
              sub={
                data?.totalWalRetained
                  ? fmtBytes(data.totalWalRetained)
                  : undefined
              }
              icon={<Radio size={13} />}
              loading={loading && !data}
            />
          </Card>
        </div>

        {/* Lag trend */}
        <Card className="mb-5">
          <CardHeader
            title="Replication lag trend (6h)"
            icon={<GitBranch size={15} />}
          />
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={lagTrend ?? []}>
              <defs>
                <linearGradient id="lagG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="time"
                tickFormatter={tickTime}
                tick={{ fontSize: 10 }}
              />
              <YAxis
                tickFormatter={(v) => fmtBytes(v)}
                tick={{ fontSize: 10 }}
                width={70}
              />
              <Tooltip formatter={(v: number) => fmtBytes(v)} />
              <Area
                type="monotone"
                dataKey="value"
                name="Lag"
                stroke="#14b8a6"
                fill="url(#lagG)"
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* Replicas */}
          <Card>
            <CardHeader
              title="Connected replicas"
              icon={<Server size={15} />}
            />
            {!data?.replicas?.length ? (
              data?.isPrimary === false && data?.receiverInfo ? (
                <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)]">
                  <div className="text-xs font-medium text-primary mb-2">
                    WAL Receiver (this is a replica)
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted">Status:</span>{" "}
                      <Badge
                        variant={
                          data.receiverInfo.status === "streaming"
                            ? "success"
                            : "warning"
                        }
                        size="xs"
                      >
                        {data.receiverInfo.status}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted">Latency:</span>{" "}
                      <span className="text-primary font-medium">
                        {data.receiverInfo.latencyMs !== null
                          ? `${data.receiverInfo.latencyMs}ms`
                          : "—"}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted">Received LSN:</span>{" "}
                      <span className="mono text-secondary">
                        {data.receiverInfo.receivedLsn ?? "—"}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={<Server size={28} />}
                  title="No replicas connected"
                  message="Streaming replicas will appear here automatically"
                />
              )
            ) : (
              <div className="space-y-3">
                {data.replicas.map((r) => (
                  <ReplicaCard key={r.pid} replica={r} />
                ))}
              </div>
            )}
          </Card>

          {/* Slots */}
          <Card>
            <CardHeader
              title="Replication slots"
              subtitle="Inactive slots retain WAL and can fill disk"
              icon={<Radio size={15} />}
            />
            {!data?.slots?.length ? (
              <EmptyState
                icon={<Radio size={28} />}
                title="No replication slots"
              />
            ) : (
              <DataTable<ReplicationSlot>
                data={data.slots}
                keyFn={(s) => s.slotName}
                rowClassName={(s) =>
                  s.isBlocking ? "bg-red-50/50 dark:bg-red-500/5" : ""
                }
                columns={[
                  {
                    key: "name",
                    header: "Slot",
                    render: (s) => (
                      <div>
                        <span className="mono text-xs text-primary">
                          {s.slotName}
                        </span>
                        <div className="text-[10px] text-muted">
                          {s.slotType}
                          {s.plugin ? ` · ${s.plugin}` : ""}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "active",
                    header: "Status",
                    width: "90px",
                    render: (s) => (
                      <Badge
                        variant={s.active ? "success" : "error"}
                        size="xs"
                        dot={s.active}
                      >
                        {s.active ? "active" : "inactive"}
                      </Badge>
                    ),
                  },
                  {
                    key: "wal",
                    header: "WAL retained",
                    width: "110px",
                    align: "right",
                    render: (s) => (
                      <span
                        className={cn(
                          "text-xs font-bold",
                          s.isBlocking
                            ? "text-red-400"
                            : s.walBytes > 1024 ** 3
                              ? "text-yellow-400"
                              : "text-primary",
                        )}
                      >
                        {fmtBytes(s.walBytes)}
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
