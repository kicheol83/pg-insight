// ══════════════════════════════════════════════════════════════
// src/pages/database/DatabasePage.tsx
//
// "PostgreSQL DBA를 위한 Admin 이야기" kitobining 1.2-bobi —
// 데이터베이스 모니터링 (Database monitoring) — pg_stat_database
// asosida. Bu sahifa Connections/Locks kabi session yoki obyekt
// darajasida emas, BUTUN DATABASE darajasidagi kumulyativ
// hisoblagichlarni ko'rsatadi: commit/rollback nisbati, cache hit,
// temp file'ga tushib ketgan operatsiyalar, deadlock'lar.
// ══════════════════════════════════════════════════════════════

import { Database, RefreshCw, AlertTriangle, Clock } from "lucide-react";
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
import { fmtBytes, fmtNum, fmtMs, fmtRelative, cn } from "@/lib/format";

export default function DatabasePage() {
  const { activeTargetId } = useActiveTarget();

  const { data, loading, refetch, updatedAt } = useQuery(
    () => liveApi.databaseStats(activeTargetId ?? ""),
    { refreshInterval: 15_000, enabled: !!activeTargetId },
  );

  if (!activeTargetId) {
    return (
      <>
        <TopBar
          title="Database"
          subtitle="pg_stat_database — butun DB darajasidagi statistika"
        />
        <PageContent>
          <div className="flex items-center gap-3 mb-5">
            <TargetSelector />
          </div>
          <EmptyState
            icon={<Database size={32} />}
            title="Target tanlanmagan"
          />
        </PageContent>
      </>
    );
  }

  const totalDeadlocks = (data?.databases ?? []).reduce(
    (s, d) => s + d.deadlocks,
    0,
  );
  const totalTempBytes = (data?.databases ?? []).reduce(
    (s, d) => s + d.tempBytes,
    0,
  );
  const totalTempFiles = (data?.databases ?? []).reduce(
    (s, d) => s + d.tempFiles,
    0,
  );
  const avgCacheHit = data?.databases?.length
    ? data.databases.reduce((s, d) => s + d.cacheHitRatio, 0) /
      data.databases.length
    : null;

  return (
    <>
      <TopBar
        title="Database"
        subtitle={
          updatedAt
            ? `Yangilandi hozirgina`
            : "pg_stat_database — butun DB darajasidagi statistika"
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
        <div className="flex items-center gap-3 mb-5">
          <TargetSelector />
          {!data?.trackIoTimingEnabled && (
            <Badge variant="warning" size="sm">
              track_io_timing o'chirilgan — I/O vaqt o'lchamlari ko'rsatilmaydi
            </Badge>
          )}
        </div>

        {/* Umumiy statistika */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          <Card padding="sm">
            <div className="text-[10px] text-muted uppercase tracking-wide mb-1">
              O'rtacha cache hit
            </div>
            <div
              className={cn(
                "text-2xl font-bold tabular-nums",
                avgCacheHit === null
                  ? "text-muted"
                  : avgCacheHit < 0.9
                    ? "text-red-400"
                    : avgCacheHit < 0.98
                      ? "text-yellow-400"
                      : "text-green-400",
              )}
            >
              {avgCacheHit !== null
                ? `${(avgCacheHit * 100).toFixed(1)}%`
                : "—"}
            </div>
          </Card>
          <Card padding="sm">
            <div className="text-[10px] text-muted uppercase tracking-wide mb-1">
              Deadlock'lar (jami)
            </div>
            <div
              className={cn(
                "text-2xl font-bold tabular-nums",
                totalDeadlocks > 0 ? "text-red-400" : "text-primary",
              )}
            >
              {fmtNum(totalDeadlocks)}
            </div>
          </Card>
          <Card padding="sm">
            <div className="text-[10px] text-muted uppercase tracking-wide mb-1">
              Temp fayllar
            </div>
            <div
              className={cn(
                "text-2xl font-bold tabular-nums",
                totalTempFiles > 100 ? "text-yellow-400" : "text-primary",
              )}
            >
              {fmtNum(totalTempFiles)}
            </div>
          </Card>
          <Card padding="sm">
            <div className="text-[10px] text-muted uppercase tracking-wide mb-1">
              Temp hajmi
            </div>
            <div className="text-2xl font-bold tabular-nums text-primary">
              {fmtBytes(totalTempBytes)}
            </div>
          </Card>
        </div>

        {totalTempBytes > 1024 * 1024 * 1024 && (
          <Card className="mb-5 border-yellow-300 dark:border-yellow-500/40">
            <div className="flex items-start gap-3">
              <AlertTriangle
                size={16}
                className="text-yellow-400 mt-0.5 shrink-0"
              />
              <div>
                <p className="text-sm font-medium text-primary">
                  Temp fayllar katta hajmni egallayapti
                </p>
                <p className="text-xs text-secondary mt-1">
                  Bu odatda{" "}
                  <code className="mono text-brand-500">work_mem</code>{" "}
                  sozlamasi RAM'da sig'maydigan sort yoki hash operatsiyalari
                  uchun yetarli emasligini bildiradi.{" "}
                  <code className="mono text-brand-500">work_mem</code>ni
                  oshirishni yoki og'ir so'rovlarni optimallashtirishni ko'rib
                  chiqing.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Har bir database uchun batafsil kartalar */}
        <div className="space-y-4">
          {(data?.databases ?? []).map((db) => (
            <Card key={db.name}>
              <CardHeader
                title={db.name}
                icon={<Database size={15} />}
                subtitle={
                  db.statsReset
                    ? `Statistika ${fmtRelative(db.statsReset)} dan beri`
                    : undefined
                }
                action={
                  <Badge variant="default" size="xs">
                    {db.numBackends} ulanish
                  </Badge>
                }
              />

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div>
                  <div className="text-[10px] text-muted mb-1">
                    Cache hit ratio
                  </div>
                  <div
                    className={cn(
                      "text-lg font-bold tabular-nums",
                      db.cacheHitRatio < 0.9
                        ? "text-red-400"
                        : db.cacheHitRatio < 0.98
                          ? "text-yellow-400"
                          : "text-green-400",
                    )}
                  >
                    {(db.cacheHitRatio * 100).toFixed(1)}%
                  </div>
                  <ProgressBar
                    value={db.cacheHitRatio * 100}
                    size="xs"
                    className="mt-1"
                    colorFn={(pct) =>
                      pct < 90 ? "#ef4444" : pct < 98 ? "#eab308" : "#22c55e"
                    }
                  />
                </div>
                <div>
                  <div className="text-[10px] text-muted mb-1">
                    Commit / Rollback
                  </div>
                  <div className="text-lg font-bold tabular-nums text-primary">
                    {(db.commitRatio * 100).toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-muted mt-1">
                    {fmtNum(db.xactCommit)} / {fmtNum(db.xactRollback)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted mb-1">Deadlocks</div>
                  <div
                    className={cn(
                      "text-lg font-bold tabular-nums",
                      db.deadlocks > 0 ? "text-red-400" : "text-primary",
                    )}
                  >
                    {fmtNum(db.deadlocks)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted mb-1">
                    Conflicts (replica)
                  </div>
                  <div
                    className={cn(
                      "text-lg font-bold tabular-nums",
                      db.conflicts > 0 ? "text-yellow-400" : "text-primary",
                    )}
                  >
                    {fmtNum(db.conflicts)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-4 border-t border-[var(--border)]">
                <div className="p-2.5 bg-[var(--bg-subtle)] rounded-lg">
                  <div className="text-[10px] text-muted mb-1">
                    Tuple qaytarilgan / olingan
                  </div>
                  <div className="text-xs font-medium text-primary">
                    {fmtNum(db.tupReturned)} / {fmtNum(db.tupFetched)}
                  </div>
                </div>
                <div className="p-2.5 bg-[var(--bg-subtle)] rounded-lg">
                  <div className="text-[10px] text-muted mb-1">
                    Insert / Update / Delete
                  </div>
                  <div className="text-xs font-medium text-primary">
                    {fmtNum(db.tupInserted)} / {fmtNum(db.tupUpdated)} /{" "}
                    {fmtNum(db.tupDeleted)}
                  </div>
                </div>
                <div className="p-2.5 bg-[var(--bg-subtle)] rounded-lg">
                  <div className="text-[10px] text-muted mb-1">
                    Temp fayl / hajm
                  </div>
                  <div className="text-xs font-medium text-primary">
                    {fmtNum(db.tempFiles)} / {fmtBytes(db.tempBytes)}
                  </div>
                </div>
                <div className="p-2.5 bg-[var(--bg-subtle)] rounded-lg">
                  <div className="text-[10px] text-muted mb-1">
                    Checksum xatolari
                  </div>
                  <div
                    className={cn(
                      "text-xs font-medium",
                      db.checksumFailures > 0 ? "text-red-400" : "text-primary",
                    )}
                  >
                    {fmtNum(db.checksumFailures)}
                  </div>
                </div>
              </div>

              {data?.trackIoTimingEnabled &&
                (db.blkReadTimeMs > 0 || db.blkWriteTimeMs > 0) && (
                  <div className="flex gap-4 pt-3 mt-3 border-t border-[var(--border)] text-xs text-muted">
                    <span className="flex items-center gap-1">
                      <Clock size={11} /> O'qish vaqti:{" "}
                      <span className="text-primary font-medium">
                        {fmtMs(db.blkReadTimeMs)}
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={11} /> Yozish vaqti:{" "}
                      <span className="text-primary font-medium">
                        {fmtMs(db.blkWriteTimeMs)}
                      </span>
                    </span>
                  </div>
                )}
            </Card>
          ))}
          {!loading && !data?.databases?.length && (
            <Card>
              <EmptyState
                icon={<Database size={28} />}
                title="Database topilmadi"
              />
            </Card>
          )}
        </div>
      </PageContent>
    </>
  );
}
