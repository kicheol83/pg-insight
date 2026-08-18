import { useState } from "react";
import {
  Zap,
  RefreshCw,
  Play,
  Hash,
  AlertTriangle,
  TrendingDown,
  Filter,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/layout/AppLayout";
import {
  Card,
  StatBox,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Select,
  TargetSelector,
} from "@/components/ui";
import { useQuery } from "@/hooks/useQuery";
import { useActiveTarget } from "@/store/app";
import { liveApi } from "@/api/endpoints";
import { fmtMs, fmtNum, truncateSql, cn } from "@/lib/format";
import { ExplainViewer } from "./ExplainViewer";
import { QueryDetailModal } from "./QueryDetailModal";
import { TAG_META, type QueryTag } from "./queryTags";
import type { QueryStat } from "@/types/model";

export default function QueriesPage() {
  const { activeTargetId } = useActiveTarget();
  const [tagFilter, setTagFilter] = useState<QueryTag | "">("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"mean" | "total" | "calls" | "max">(
    "mean",
  );
  const [selected, setSelected] = useState<QueryStat | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data, loading, refetch } = useQuery(
    () => liveApi.slowQueries(activeTargetId ?? "", 50),
    { refreshInterval: 30_000, enabled: !!activeTargetId },
  );

  const filtered = (data?.queries ?? [])
    .filter((q) => {
      if (tagFilter && !q.tags.includes(tagFilter)) return false;
      if (search)
        return q.queryText.toLowerCase().includes(search.toLowerCase());
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "mean":
          return b.meanTimeMs - a.meanTimeMs;
        case "total":
          return b.totalTimeMs - a.totalTimeMs;
        case "calls":
          return b.calls - a.calls;
        case "max":
          return b.maxTimeMs - a.maxTimeMs;
      }
    });

  const tagCounts = (data?.queries ?? []).reduce(
    (acc, q) => {
      q.tags.forEach((t) => {
        acc[t] = (acc[t] ?? 0) + 1;
      });
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <>
      <TopBar
        title="Queries"
        subtitle="pg_stat_statements analysis & EXPLAIN ANALYZE"
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
        </div>

        <Tabs defaultValue="slow">
          <TabList>
            <Tab value="slow" icon={<Zap size={13} />}>
              Slow queries
            </Tab>
            <Tab value="explain" icon={<Play size={13} />}>
              EXPLAIN ANALYZE
            </Tab>
          </TabList>

          <TabPanel value="slow">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <Card padding="sm">
                <StatBox
                  label="Unique queries"
                  value={data?.count ?? "—"}
                  icon={<Hash size={13} />}
                  loading={loading && !data}
                />
              </Card>
              <Card padding="sm">
                <StatBox
                  label="Slow (>1s)"
                  value={(data?.queries ?? []).filter((q) => q.isSlow).length}
                  icon={<Zap size={13} className="text-yellow-400" />}
                  loading={loading && !data}
                />
              </Card>
              <Card padding="sm">
                <StatBox
                  label="Inconsistent"
                  value={tagCounts["inconsistent"] ?? 0}
                  icon={<AlertTriangle size={13} className="text-orange-400" />}
                  loading={loading && !data}
                />
              </Card>
              <Card padding="sm">
                <StatBox
                  label="Low cache hit"
                  value={tagCounts["low-cache"] ?? 0}
                  icon={<TrendingDown size={13} className="text-red-400" />}
                  loading={loading && !data}
                />
              </Card>
            </div>

            {/* Tag pills */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-xs text-muted mr-1">Filter:</span>
              <button
                onClick={() => setTagFilter("")}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full border font-medium transition-colors",
                  !tagFilter
                    ? "bg-brand-500 text-white border-brand-500"
                    : "border-[var(--border)] text-secondary hover:border-brand-500 hover:text-brand-500",
                )}
              >
                All ({data?.queries?.length ?? 0})
              </button>
              {(
                Object.entries(TAG_META) as Array<
                  [QueryTag, (typeof TAG_META)[QueryTag]]
                >
              ).map(([tag, meta]) => {
                const count = tagCounts[tag] ?? 0;
                if (!count) return null;
                return (
                  <button
                    key={tag}
                    onClick={() => setTagFilter(tag === tagFilter ? "" : tag)}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-full border font-medium transition-colors",
                      tagFilter === tag
                        ? "bg-brand-500 text-white border-brand-500"
                        : "border-[var(--border)] text-secondary hover:border-brand-500 hover:text-brand-500",
                    )}
                  >
                    {meta.label} ({count})
                  </button>
                );
              })}
            </div>

            {/* Search + sort */}
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1 min-w-48">
                <Filter
                  size={13}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search query text…"
                  className="input pl-8 text-xs w-full"
                />
              </div>
              <Select
                value={sortBy}
                onChange={(v) => setSortBy(v as typeof sortBy)}
                className="w-44"
                options={[
                  { value: "mean", label: "Sort: Mean time" },
                  { value: "total", label: "Sort: Total time" },
                  { value: "calls", label: "Sort: Calls" },
                  { value: "max", label: "Sort: Max time" },
                ]}
              />
            </div>

            <Card>
              <DataTable<QueryStat>
                loading={loading && !data}
                data={filtered}
                keyFn={(q) => q.queryId}
                emptyMsg="No queries match the filter"
                emptyIcon={<Zap size={32} />}
                onRowClick={(q) => {
                  setSelected(q);
                  setDetailOpen(true);
                }}
                columns={[
                  {
                    key: "query",
                    header: "Query",
                    render: (q) => (
                      <div className="max-w-[340px]">
                        <div className="mono text-xs text-secondary truncate">
                          {truncateSql(q.queryText, 100)}
                        </div>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {q.tags.slice(0, 3).map((tag) => {
                            const meta = TAG_META[tag as QueryTag];
                            return meta ? (
                              <Badge key={tag} variant={meta.variant} size="xs">
                                {meta.label}
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "calls",
                    header: "Calls",
                    width: "80px",
                    align: "right",
                    render: (q) => (
                      <span
                        className={cn(
                          "text-xs font-bold",
                          q.isFrequent ? "text-blue-400" : "text-primary",
                        )}
                      >
                        {fmtNum(q.calls)}
                      </span>
                    ),
                  },
                  {
                    key: "mean",
                    header: "Mean",
                    width: "90px",
                    align: "right",
                    render: (q) => (
                      <span
                        className={cn(
                          "text-xs font-bold",
                          q.meanTimeMs > 10000
                            ? "text-red-400"
                            : q.meanTimeMs > 1000
                              ? "text-yellow-400"
                              : "text-primary",
                        )}
                      >
                        {fmtMs(q.meanTimeMs)}
                      </span>
                    ),
                  },
                  {
                    key: "max",
                    header: "Max",
                    width: "90px",
                    align: "right",
                    render: (q) => (
                      <span className="text-xs text-secondary">
                        {fmtMs(q.maxTimeMs)}
                      </span>
                    ),
                  },
                  {
                    key: "cache",
                    header: "Cache hit",
                    width: "90px",
                    align: "right",
                    render: (q) => (
                      <span
                        className={cn(
                          "text-xs font-bold",
                          q.cacheHitRatio < 0.8
                            ? "text-red-400"
                            : q.cacheHitRatio < 0.95
                              ? "text-yellow-400"
                              : "text-green-400",
                        )}
                      >
                        {(q.cacheHitRatio * 100).toFixed(1)}%
                      </span>
                    ),
                  },
                  {
                    key: "rows",
                    header: "Rows/call",
                    width: "90px",
                    align: "right",
                    render: (q) => (
                      <span
                        className={cn(
                          "text-xs",
                          q.rowsPerCall > 10000
                            ? "text-orange-400"
                            : "text-secondary",
                        )}
                      >
                        {fmtNum(q.rowsPerCall)}
                      </span>
                    ),
                  },
                ]}
              />
            </Card>
          </TabPanel>

          <TabPanel value="explain">
            <Card>
              {activeTargetId ? (
                <ExplainViewer targetId={activeTargetId} />
              ) : (
                <EmptyState title="Select a target first" />
              )}
            </Card>
          </TabPanel>
        </Tabs>

        <QueryDetailModal
          query={selected}
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
        />
      </PageContent>
    </>
  );
}
