import { useState } from "react";
import { Gauge, Play } from "lucide-react";
import {
  Card,
  CardHeader,
  Badge,
  Button,
  DataTable,
  EmptyState,
  CopyButton,
} from "@/components/ui";
import { liveApi } from "@/api/endpoints";
import { fmtBytes, cn } from "@/lib/format";
import { useI18n, type MessageKey } from "@/i18n";
import type { TableBloatEntry, TableBloatReport } from "@/types/model";

const METHOD_LABEL: Record<TableBloatEntry["method"], MessageKey> = {
  pgstattuple_approx: "tables.bloatMethodApprox",
  dead_tuples: "tables.bloatMethodEstimate",
  skipped_large: "tables.bloatMethodSkipped",
  failed: "tables.bloatMethodFailed",
};

function wastedColor(pct: number) {
  if (pct >= 40) return "text-red-400";
  if (pct >= 20) return "text-yellow-400";
  return "text-primary";
}

export function BloatCard({ targetId }: { targetId: string }) {
  const { t } = useI18n();
  const [report, setReport] = useState<TableBloatReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function measure() {
    setLoading(true);
    setError(null);
    try {
      setReport(await liveApi.tableBloat(targetId));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mb-5">
      <CardHeader
        title={t("tables.bloatTitle")}
        subtitle={t("tables.bloatSubtitle")}
        icon={<Gauge size={15} />}
        action={
          <Button
            size="xs"
            variant="outline"
            icon={<Play size={11} />}
            loading={loading}
            onClick={measure}
            disabled={!targetId}
          >
            {report ? t("tables.bloatRemeasure") : t("tables.bloatMeasure")}
          </Button>
        }
      />
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      {!report ? (
        <p className="text-xs text-muted">{t("tables.bloatIntro")}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px] text-muted">
            <Badge
              variant={
                report.method === "pgstattuple_approx" ? "success" : "warning"
              }
              size="xs"
            >
              {t(
                report.method === "pgstattuple_approx"
                  ? "tables.bloatMethodApprox"
                  : "tables.bloatMethodEstimate",
              )}
            </Badge>
            <span>
              {t("tables.bloatMeasuredIn", { ms: report.durationMs })}
            </span>
          </div>
          {report.method !== "pgstattuple_approx" && (
            <div className="flex items-center gap-1.5 mb-3 text-[11px] text-yellow-500 dark:text-yellow-400">
              <span>
                {report.grantCommand
                  ? t("tables.bloatNeedsGrant")
                  : t("tables.bloatNeedsExtension")}
              </span>
              <code className="mono text-brand-500 bg-brand-500/10 rounded px-2 py-0.5">
                {report.grantCommand ?? report.installCommand}
              </code>
              <CopyButton text={report.grantCommand ?? report.installCommand} />
            </div>
          )}
          {report.tables.length === 0 ? (
            <EmptyState title={t("common.noData")} />
          ) : (
            <DataTable<TableBloatEntry>
              data={report.tables}
              keyFn={(r) => `${r.schemaName}.${r.tableName}`}
              columns={[
                {
                  key: "table",
                  header: t("tables.bloatColTable"),
                  render: (r) => (
                    <div>
                      <span className="mono text-xs text-primary">
                        {r.schemaName}.{r.tableName}
                      </span>
                      <div className="text-[10px] text-muted">
                        {t(METHOD_LABEL[r.method])}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "size",
                  header: t("tables.bloatColSize"),
                  align: "right",
                  width: "100px",
                  render: (r) => (
                    <span className="text-xs">{fmtBytes(r.tableBytes)}</span>
                  ),
                },
                {
                  key: "wasted",
                  header: t("tables.bloatColWasted"),
                  align: "right",
                  width: "130px",
                  render: (r) => (
                    <span
                      className={cn(
                        "text-xs font-bold",
                        wastedColor(r.wastedPct),
                      )}
                    >
                      {fmtBytes(r.wastedBytes)} · {r.wastedPct.toFixed(1)}%
                    </span>
                  ),
                },
                {
                  key: "dead",
                  header: t("tables.bloatColDead"),
                  align: "right",
                  width: "90px",
                  render: (r) => (
                    <span className="text-xs">
                      {r.deadTuplePct.toFixed(1)}%
                    </span>
                  ),
                },
                {
                  key: "free",
                  header: t("tables.bloatColFree"),
                  align: "right",
                  width: "90px",
                  render: (r) => (
                    <span className="text-xs">
                      {r.freePct === null ? "—" : `${r.freePct.toFixed(1)}%`}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </>
      )}
    </Card>
  );
}
