import { useState } from "react";
import {
  Table2,
  RefreshCw,
  HardDrive,
  AlertTriangle,
  Trash2,
  Search as SearchIcon,
  Play,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/layout/AppLayout";
import {
  Card,
  CardHeader,
  Badge,
  Button,
  DataTable,
  StatBox,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  CopyButton,
  TargetSelector,
  Modal,
  useToast,
} from "@/components/ui";
import { useQuery } from "@/hooks/useQuery";
import { useActiveTarget } from "@/store/app";
import { liveApi, maintenanceApi } from "@/api/endpoints";
import { fmtBytes, fmtNum, fmtRelative, cn } from "@/lib/format";
import { severityBadge } from "@/lib/colors";
import type { TableStat, IndexStat, TableRecommendation } from "@/types/model";

function BloatBar({ ratio }: { ratio: number }) {
  const pct = Math.min(ratio * 100, 100);
  const color = pct >= 40 ? "#ef4444" : pct >= 20 ? "#eab308" : "#22c55e";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700">
        <div
          className="h-1.5 rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span
        className={cn(
          "text-xs font-bold w-11 text-right",
          pct >= 40
            ? "text-red-400"
            : pct >= 20
              ? "text-yellow-400"
              : "text-green-400",
        )}
      >
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

export default function TablesPage() {
  const { activeTargetId } = useActiveTarget();
  const [search, setSearch] = useState("");
  const [runningRec, setRunningRec] = useState<number | null>(null);
  const [confirmDrop, setConfirmDrop] = useState<{
    rec: TableRecommendation;
    index: number;
  } | null>(null);
  const toast = useToast();

  const { data, loading, refetch } = useQuery(
    () => liveApi.tableStats(activeTargetId ?? ""),
    { refreshInterval: 60_000, enabled: !!activeTargetId },
  );

  const tables = (data?.tables ?? []).filter(
    (t) =>
      !search ||
      `${t.schemaName}.${t.tableName}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const indexes = (data?.indexes ?? []).filter(
    (i) => !search || i.indexName.toLowerCase().includes(search.toLowerCase()),
  );

  function splitTargetName(targetName: string): [string, string] | null {
    const dotIndex = targetName.indexOf(".");
    if (dotIndex === -1) return null;
    return [targetName.slice(0, dotIndex), targetName.slice(dotIndex + 1)];
  }

  async function handleRunVacuum(rec: TableRecommendation, index: number) {
    const parts = splitTargetName(rec.targetName);
    if (!parts || !activeTargetId) return;
    const [schema, table] = parts;
    setRunningRec(index);
    try {
      await maintenanceApi.vacuumTable(activeTargetId, schema, table);
      toast({
        type: "success",
        title: "VACUUM boshlandi",
        message: `${rec.targetName} — natijani kuzatish uchun Vacuum sahifasiga o'ting`,
      });
    } catch (err) {
      toast({
        type: "error",
        title: "VACUUM boshlanmadi",
        message: (err as Error).message,
      });
    } finally {
      setRunningRec(null);
    }
  }

  async function handleConfirmDropIndex() {
    if (!confirmDrop || !activeTargetId) return;
    const parts = splitTargetName(confirmDrop.rec.targetName);
    if (!parts) return;
    const [schema, index] = parts;
    setRunningRec(confirmDrop.index);
    try {
      await maintenanceApi.dropUnusedIndex(activeTargetId, schema, index);
      toast({
        type: "success",
        title: "Indeks o'chirilmoqda",
        message: confirmDrop.rec.targetName,
      });
      setConfirmDrop(null);
      setTimeout(refetch, 2000);
    } catch (err) {
      toast({
        type: "error",
        title: "O'chirib bo'lmadi",
        message: (err as Error).message,
      });
    } finally {
      setRunningRec(null);
    }
  }

  return (
    <>
      <TopBar
        title="Tables & Indexes"
        subtitle="Bloat, scans, and index health"
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
          <div className="relative ml-auto">
            <SearchIcon
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tables & indexes…"
              className="input pl-8 w-56 text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          <Card padding="sm">
            <StatBox
              label="Table size"
              value={fmtBytes(data?.totalTableSizeBytes ?? 0)}
              icon={<HardDrive size={13} />}
              loading={loading && !data}
            />
          </Card>
          <Card padding="sm">
            <StatBox
              label="Index size"
              value={fmtBytes(data?.totalIndexSizeBytes ?? 0)}
              icon={<HardDrive size={13} />}
              loading={loading && !data}
            />
          </Card>
          <Card padding="sm">
            <StatBox
              label="Need vacuum"
              value={data?.tablesNeedingVacuum ?? "—"}
              icon={
                <Trash2
                  size={13}
                  className={data?.tablesNeedingVacuum ? "text-yellow-400" : ""}
                />
              }
              loading={loading && !data}
            />
          </Card>
          <Card padding="sm">
            <StatBox
              label="Unused indexes"
              value={data?.unusedIndexCount ?? "—"}
              sub={
                data?.unusedIndexSizeBytes
                  ? `${fmtBytes(data.unusedIndexSizeBytes)} wasted`
                  : undefined
              }
              icon={
                <AlertTriangle
                  size={13}
                  className={data?.unusedIndexCount ? "text-orange-400" : ""}
                />
              }
              loading={loading && !data}
            />
          </Card>
        </div>

        {(data?.recommendations?.length ?? 0) > 0 && (
          <Card className="mb-5">
            <CardHeader
              title="Recommendations"
              subtitle="Actionable improvements — copy the command to apply"
              icon={<AlertTriangle size={15} className="text-yellow-400" />}
            />
            <div className="space-y-2">
              {(data?.recommendations ?? []).map((rec, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)]"
                >
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0 mt-0.5",
                      severityBadge(rec.severity),
                    )}
                  >
                    {rec.severity}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-primary mb-1">
                      {rec.message}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <code className="text-[11px] mono text-brand-500 bg-brand-500/10 rounded px-2 py-0.5 truncate">
                        {rec.command}
                      </code>
                      <CopyButton text={rec.command} />
                    </div>
                  </div>
                  {rec.type === "vacuum" && (
                    <Button
                      size="xs"
                      variant="outline"
                      icon={<Play size={11} />}
                      loading={runningRec === i}
                      onClick={() => handleRunVacuum(rec, i)}
                      className="shrink-0"
                    >
                      Ishga tushirish
                    </Button>
                  )}
                  {rec.type === "unused_index" && (
                    <Button
                      size="xs"
                      variant="danger"
                      icon={<Trash2 size={11} />}
                      loading={runningRec === i}
                      onClick={() => setConfirmDrop({ rec, index: i })}
                      className="shrink-0"
                    >
                      O'chirish
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        <Modal
          open={!!confirmDrop}
          onClose={() => setConfirmDrop(null)}
          title="Indeksni o'chirishni tasdiqlang"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmDrop(null)}>
                Bekor qilish
              </Button>
              <Button
                variant="danger"
                icon={<Trash2 size={14} />}
                onClick={handleConfirmDropIndex}
                loading={runningRec !== null}
              >
                Ha, o'chirish
              </Button>
            </>
          }
        >
          {confirmDrop && (
            <div className="space-y-3">
              <p className="text-sm text-secondary">
                <code className="mono text-brand-500">
                  {confirmDrop.rec.targetName}
                </code>{" "}
                indeksi o'chiriladi. Backend bu amalni bajarishdan oldin indeks
                hali ham ishlatilmayotganini va constraint'ga (primary
                key/unique) tegishli emasligini qayta tekshiradi.
              </p>
              <div className="text-xs text-yellow-500 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-500/10 rounded-lg px-3 py-2">
                Bu amalni qaytarib bo'lmaydi — indeksni qayta yaratish uchun uni
                noldan yaratishga to'g'ri keladi.
              </div>
            </div>
          )}
        </Modal>

        <Tabs defaultValue="tables">
          <TabList>
            <Tab value="tables" icon={<Table2 size={13} />}>
              Tables ({tables.length})
            </Tab>
            <Tab value="indexes" icon={<HardDrive size={13} />}>
              Indexes ({indexes.length})
            </Tab>
          </TabList>

          <TabPanel value="tables">
            <Card>
              <DataTable<TableStat>
                loading={loading && !data}
                data={tables}
                keyFn={(t) => `${t.schemaName}.${t.tableName}`}
                emptyMsg="No tables found"
                rowClassName={(t) =>
                  t.needsVacuum ? "bg-yellow-50/50 dark:bg-yellow-500/5" : ""
                }
                columns={[
                  {
                    key: "name",
                    header: "Table",
                    render: (t) => (
                      <div>
                        <span className="mono text-xs text-primary">
                          {t.schemaName}.{t.tableName}
                        </span>
                        <div className="flex gap-1 mt-0.5">
                          {t.needsVacuum && (
                            <Badge variant="warning" size="xs">
                              needs vacuum
                            </Badge>
                          )}
                          {t.needsIndex && (
                            <Badge variant="orange" size="xs">
                              seq-scan heavy
                            </Badge>
                          )}
                          {t.hasVacuumDisabled && (
                            <Badge variant="error" size="xs">
                              autovacuum off
                            </Badge>
                          )}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "live",
                    header: "Live rows",
                    width: "90px",
                    align: "right",
                    render: (t) => (
                      <span className="text-xs text-primary">
                        {fmtNum(t.liveTuples)}
                      </span>
                    ),
                  },
                  {
                    key: "dead",
                    header: "Dead rows",
                    width: "90px",
                    align: "right",
                    render: (t) => (
                      <span
                        className={cn(
                          "text-xs",
                          t.deadTuples > t.liveTuples * 0.2
                            ? "text-red-400 font-bold"
                            : "text-secondary",
                        )}
                      >
                        {fmtNum(t.deadTuples)}
                      </span>
                    ),
                  },
                  {
                    key: "bloat",
                    header: "Bloat",
                    width: "140px",
                    render: (t) => <BloatBar ratio={t.bloatRatio} />,
                  },
                  {
                    key: "scans",
                    header: "Seq / Idx scans",
                    width: "130px",
                    align: "right",
                    render: (t) => (
                      <div className="text-xs">
                        <span
                          className={cn(
                            t.seqScanRatio > 0.5 && t.seqScans > 100
                              ? "text-orange-400 font-bold"
                              : "text-secondary",
                          )}
                        >
                          {fmtNum(t.seqScans)}
                        </span>
                        <span className="text-muted"> / </span>
                        <span className="text-secondary">
                          {fmtNum(t.idxScans)}
                        </span>
                      </div>
                    ),
                  },
                  {
                    key: "size",
                    header: "Total size",
                    width: "90px",
                    align: "right",
                    render: (t) => (
                      <span className="text-xs text-primary font-medium">
                        {fmtBytes(t.totalSizeBytes)}
                      </span>
                    ),
                  },
                  {
                    key: "vacuum",
                    header: "Last vacuum",
                    width: "110px",
                    align: "right",
                    render: (t) => {
                      const last = t.lastAutovacuum ?? t.lastVacuum;
                      return (
                        <span className="text-[11px] text-muted">
                          {last ? fmtRelative(last) : "never"}
                        </span>
                      );
                    },
                  },
                ]}
              />
            </Card>
          </TabPanel>

          <TabPanel value="indexes">
            <Card>
              <DataTable<IndexStat>
                loading={loading && !data}
                data={indexes}
                keyFn={(i) => `${i.schemaName}.${i.indexName}`}
                emptyMsg="No indexes found"
                rowClassName={(i) =>
                  i.isUnused ? "bg-orange-50/50 dark:bg-orange-500/5" : ""
                }
                columns={[
                  {
                    key: "name",
                    header: "Index",
                    render: (i) => (
                      <div>
                        <span className="mono text-xs text-primary">
                          {i.indexName}
                        </span>
                        <div className="text-[10px] text-muted">
                          on {i.schemaName}.{i.tableName}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "flags",
                    header: "Type",
                    width: "130px",
                    render: (i) => (
                      <div className="flex gap-1 flex-wrap">
                        {i.isPrimary && (
                          <Badge variant="info" size="xs">
                            PK
                          </Badge>
                        )}
                        {i.isUnique && !i.isPrimary && (
                          <Badge variant="purple" size="xs">
                            unique
                          </Badge>
                        )}
                        {i.isUnused && (
                          <Badge variant="orange" size="xs">
                            unused
                          </Badge>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: "scans",
                    header: "Scans",
                    width: "90px",
                    align: "right",
                    render: (i) => (
                      <span
                        className={cn(
                          "text-xs font-medium",
                          i.idxScans === 0 ? "text-orange-400" : "text-primary",
                        )}
                      >
                        {fmtNum(i.idxScans)}
                      </span>
                    ),
                  },
                  {
                    key: "size",
                    header: "Size",
                    width: "90px",
                    align: "right",
                    render: (i) => (
                      <span className="text-xs text-primary">
                        {fmtBytes(i.indexSizeBytes)}
                      </span>
                    ),
                  },
                  {
                    key: "cols",
                    header: "Columns",
                    render: (i) => (
                      <span className="mono text-[11px] text-secondary">
                        {i.columns.join(", ")}
                      </span>
                    ),
                  },
                  {
                    key: "action",
                    header: "",
                    width: "40px",
                    render: (i) =>
                      i.isUnused && !i.isPrimary ? (
                        <CopyButton
                          text={`DROP INDEX CONCURRENTLY ${i.schemaName}.${i.indexName};`}
                        />
                      ) : null,
                  },
                ]}
              />
            </Card>
          </TabPanel>
        </Tabs>
      </PageContent>
    </>
  );
}
