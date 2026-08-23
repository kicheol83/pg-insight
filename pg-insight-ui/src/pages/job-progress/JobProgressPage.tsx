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

  const { data, loading, refetch, updatedAt } = useQuery(
    () => liveApi.jobProgress(activeTargetId ?? ""),
    { refreshInterval: 5_000, enabled: !!activeTargetId },
  );

  if (!activeTargetId) {
    return (
      <>
        <TopBar
          title="Job Progress"
          subtitle="CREATE INDEX, CLUSTER, ANALYZE, COPY jarayonlari"
        />
        <PageContent>
          <div className="flex items-center gap-3 mb-5">
            <TargetSelector />
          </div>
          <EmptyState
            icon={<ListChecks size={32} />}
            title="Target tanlanmagan"
          />
        </PageContent>
      </>
    );
  }

  return (
    <>
      <TopBar
        title="Job Progress"
        subtitle={
          updatedAt
            ? "5s yangilanish"
            : "CREATE INDEX, CLUSTER, ANALYZE, COPY jarayonlari"
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
          {(data?.totalActive ?? 0) > 0 && (
            <Badge variant="info" size="sm" dot>
              {data?.totalActive} ta faol jarayon
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* CREATE INDEX */}
          <Card>
            <CardHeader
              title="CREATE INDEX"
              subtitle="Indeks yaratish jarayoni (CONCURRENTLY holatlarida ham)"
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
                title="Faol jarayon yo'q"
                message="Yangi indeks yaratilayotganda shu yerda ko'rinadi"
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
                    detail={`${fmtNum(p.blocksDone)}/${fmtNum(p.blocksTotal)} blok`}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* CLUSTER / VACUUM FULL */}
          <Card>
            <CardHeader
              title="CLUSTER / VACUUM FULL"
              subtitle="Jadvalni butunlay qayta yozish jarayoni"
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
                title="Faol jarayon yo'q"
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
                    detail={`${fmtNum(p.heapBlksScanned)}/${fmtNum(p.heapBlksTotal)} blok`}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* ANALYZE */}
          <Card>
            <CardHeader
              title="ANALYZE"
              subtitle="Statistika yig'ish jarayoni"
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
                title="Faol jarayon yo'q"
              />
            ) : (
              <div className="space-y-2.5">
                {data.analyze.map((p) => (
                  <ProgressRow
                    key={p.pid}
                    title={`${p.schemaName}.${p.tableName}`}
                    subtitle={p.phase}
                    pct={p.progressPct}
                    detail={`${fmtNum(p.sampleBlksScanned)}/${fmtNum(p.sampleBlksTotal)} blok`}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* COPY */}
          <Card>
            <CardHeader
              title="COPY"
              subtitle="Import/export jarayoni (katta CSV yuklash va h.k.)"
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
              <EmptyState icon={<Copy size={24} />} title="Faol jarayon yo'q" />
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
                        : `${fmtNum(p.tuplesProcessed)} qator`
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
