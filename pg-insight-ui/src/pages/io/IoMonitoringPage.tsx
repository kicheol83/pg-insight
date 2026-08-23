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

const BACKEND_LABELS: Record<string, string> = {
  "client backend": "Mijoz ulanishi",
  "autovacuum worker": "Autovacuum",
  "autovacuum launcher": "Autovacuum launcher",
  "background writer": "Background writer",
  checkpointer: "Checkpointer",
  walwriter: "WAL writer",
  "standalone backend": "Standalone (VACUUM)",
};

export default function IoMonitoringPage() {
  const { activeTargetId } = useActiveTarget();

  const { data, loading, refetch, updatedAt } = useQuery(
    () => liveApi.ioStats(activeTargetId ?? ""),
    { refreshInterval: 15_000, enabled: !!activeTargetId },
  );

  if (!activeTargetId) {
    return (
      <>
        <TopBar title="I/O" subtitle="Disk operatsiyalari — pg_stat_io" />
        <PageContent>
          <div className="flex items-center gap-3 mb-5">
            <TargetSelector />
          </div>
          <EmptyState
            icon={<HardDrive size={32} />}
            title="Target tanlanmagan"
          />
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
        title="I/O"
        subtitle={
          updatedAt
            ? "Yangilandi hozirgina"
            : "Disk operatsiyalari — pg_stat_io"
        }
        actions={
          <Button
            size="sm"
            variant="ghost"
            icon={<RefreshCw size={13} />}
            onClick={refetch}
            loading={loading}
          >
            Yangilash
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
                ? "pg_stat_io (to'liq)"
                : "Soddalashtirilgan ko'rinish"}
            </Badge>
          )}
          {data && !data.trackIoTimingEnabled && (
            <Badge variant="warning" size="xs">
              track_io_timing o'chirilgan
            </Badge>
          )}
        </div>

        {data && !data.pgStatIoAvailable && (
          <Card className="mb-5 border-blue-300 dark:border-blue-500/40">
            <div className="flex items-start gap-3">
              <Info size={16} className="text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-primary">
                  Bu server PostgreSQL 16'dan eski — batafsil{" "}
                  <code className="mono text-brand-500">pg_stat_io</code> mavjud
                  emas
                </p>
                <p className="text-xs text-secondary mt-1">
                  Quyida{" "}
                  <code className="mono text-brand-500">
                    pg_statio_user_tables
                  </code>{" "}
                  asosidagi soddalashtirilgan ko'rinish ko'rsatilmoqda — backend
                  turi bo'yicha ajratilmagan, faqat jadval/indeks cache
                  statistikasi. Batafsil ko'rish uchun PostgreSQL 16+ ga o'ting.
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
                title="Backend turi bo'yicha I/O yuki"
                subtitle="Kim disk'ni ko'proq band qilyapti"
                icon={<HardDrive size={15} />}
              />
              {!data.byBackendType?.length ? (
                <EmptyState
                  title="I/O faoliyati topilmadi"
                  message="Hozircha hech qanday disk operatsiyasi qayd etilmagan"
                />
              ) : (
                <div className="space-y-2.5">
                  {data.byBackendType.map((b) => (
                    <div
                      key={b.backendType}
                      className="flex items-center gap-3"
                    >
                      <div className="text-xs text-secondary w-40 shrink-0 truncate">
                        {BACKEND_LABELS[b.backendType] ?? b.backendType}
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
                title="Batafsil I/O jadvali"
                subtitle="Backend, obyekt va kontekst bo'yicha"
                icon={<HardDrive size={15} />}
              />
              <DataTable<IoStatRow>
                loading={loading && !data}
                data={data.rows ?? []}
                keyFn={(r, i) =>
                  `${r.backendType}-${r.object}-${r.context}-${i}`
                }
                emptyMsg="I/O faoliyati topilmadi"
                columns={[
                  {
                    key: "backend",
                    header: "Backend",
                    render: (r) => (
                      <span className="text-xs text-primary">
                        {BACKEND_LABELS[r.backendType] ?? r.backendType}
                      </span>
                    ),
                  },
                  {
                    key: "object",
                    header: "Obyekt",
                    width: "110px",
                    render: (r) => (
                      <span className="text-xs text-secondary">{r.object}</span>
                    ),
                  },
                  {
                    key: "context",
                    header: "Kontekst",
                    width: "100px",
                    render: (r) => (
                      <Badge variant="default" size="xs">
                        {r.context}
                      </Badge>
                    ),
                  },
                  {
                    key: "reads",
                    header: "Reads",
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
                    header: "Writes",
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
                    header: "Extends",
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
                    header: "Hits",
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
                    header: "Evictions",
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
                    header: "Vaqt (o'qish/yozish)",
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
              title="Jadval/indeks cache statistikasi"
              icon={<Maximize2 size={15} />}
            />
            {!data?.fallback ? (
              <EmptyState title="Ma'lumot yo'q" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-[var(--bg-subtle)] rounded-lg">
                  <div className="text-xs text-muted mb-2">
                    Heap (jadval ma'lumoti)
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-secondary">O'qilgan (disk'dan)</span>
                    <span className="text-primary font-medium">
                      {fmtNum(data.fallback.heapBlksRead)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-secondary">Hit (cache'dan)</span>
                    <span className="text-green-400 font-medium">
                      {fmtNum(data.fallback.heapBlksHit)}
                    </span>
                  </div>
                </div>
                <div className="p-4 bg-[var(--bg-subtle)] rounded-lg">
                  <div className="text-xs text-muted mb-2">Index</div>
                  <div className="flex justify-between text-sm">
                    <span className="text-secondary">O'qilgan (disk'dan)</span>
                    <span className="text-primary font-medium">
                      {fmtNum(data.fallback.idxBlksRead)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-secondary">Hit (cache'dan)</span>
                    <span className="text-green-400 font-medium">
                      {fmtNum(data.fallback.idxBlksHit)}
                    </span>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-xs text-muted mb-1.5">
                    Umumiy cache hit ratio
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
