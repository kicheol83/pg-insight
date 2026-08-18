import { useState } from "react";
import {
  Settings,
  RefreshCw,
  Server,
  Database,
  Puzzle,
  SlidersHorizontal,
  Search as SearchIcon,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/layout/AppLayout";
import {
  Card,
  CardHeader,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  TargetSelector,
} from "@/components/ui";
import { useQuery } from "@/hooks/useQuery";
import { useActiveTarget } from "@/store/app";
import { liveApi } from "@/api/endpoints";
import { fmtBytes, cn } from "@/lib/format";
import { severityBadge } from "@/lib/colors";
import type { PgSetting } from "@/types/model";

function SettingsGroup({
  category,
  settings,
}: {
  category: string;
  settings: PgSetting[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown size={13} className="text-muted" />
          ) : (
            <ChevronRight size={13} className="text-muted" />
          )}
          <span className="text-xs font-semibold text-primary">{category}</span>
        </div>
        <span className="text-[10px] text-muted">
          {settings.length} settings
        </span>
      </button>
      {open && (
        <div className="border-t border-[var(--border)]">
          {settings.map((s) => (
            <div
              key={s.name}
              className="flex items-start justify-between gap-4 px-4 py-2.5 border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-hover)]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <code className="mono text-xs text-primary">{s.name}</code>
                  {s.isPendingRestart && (
                    <Badge variant="warning" size="xs">
                      restart pending
                    </Badge>
                  )}
                </div>
                <p className="text-[10px] text-muted mt-0.5">{s.shortDesc}</p>
              </div>
              <div className="text-right shrink-0">
                <code className="mono text-xs text-brand-500 font-medium">
                  {s.setting}
                  {s.unit ? ` ${s.unit}` : ""}
                </code>
                <div className="text-[10px] text-muted">{s.source}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { activeTargetId } = useActiveTarget();
  const [settingSearch, setSettingSearch] = useState("");

  const {
    data: sys,
    loading,
    refetch,
  } = useQuery(() => liveApi.systemInfo(activeTargetId ?? ""), {
    refreshInterval: 120_000,
    enabled: !!activeTargetId,
  });
  const { data: settingsData, loading: settingsLoading } = useQuery(
    () => liveApi.settings(activeTargetId ?? "", settingSearch || undefined),
    { enabled: !!activeTargetId },
  );

  const grouped = (settingsData?.settings ?? [])
    .filter(
      (s) =>
        !settingSearch ||
        s.name.toLowerCase().includes(settingSearch.toLowerCase()),
    )
    .reduce(
      (acc, s) => {
        const cat = s.category.split(" / ")[0];
        (acc[cat] ??= []).push(s);
        return acc;
      },
      {} as Record<string, PgSetting[]>,
    );

  return (
    <>
      <TopBar
        title="Settings & System"
        subtitle="Server configuration, databases and extensions"
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

        {/* Config issues */}
        {(sys?.configIssues?.length ?? 0) > 0 && (
          <Card className="mb-5">
            <CardHeader
              title="Configuration recommendations"
              icon={<AlertTriangle size={15} className="text-yellow-400" />}
            />
            <div className="space-y-2">
              {(sys?.configIssues ?? []).map((issue, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)]"
                >
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0 mt-0.5",
                      severityBadge(issue.severity),
                    )}
                  >
                    {issue.severity}
                  </span>
                  <div>
                    <div className="text-xs text-primary">
                      <code className="mono text-brand-500">
                        {issue.setting}
                      </code>
                      {" = "}
                      <code className="mono">{issue.current}</code>
                      <span className="text-muted"> → recommended: </span>
                      <code className="mono text-green-400">
                        {issue.recommended}
                      </code>
                    </div>
                    <p className="text-[11px] text-muted mt-0.5">
                      {issue.reason}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Tabs defaultValue="server">
          <TabList>
            <Tab value="server" icon={<Server size={13} />}>
              Server
            </Tab>
            <Tab value="settings" icon={<SlidersHorizontal size={13} />}>
              pg_settings
            </Tab>
            <Tab value="databases" icon={<Database size={13} />}>
              Databases
            </Tab>
            <Tab value="extensions" icon={<Puzzle size={13} />}>
              Extensions
            </Tab>
          </TabList>

          <TabPanel value="server">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <Card>
                <CardHeader title="Server info" icon={<Server size={15} />} />
                <div className="space-y-0">
                  {[
                    { label: "Version", value: sys?.server?.version },
                    {
                      label: "Data directory",
                      value: sys?.server?.dataDirectory,
                      mono: true,
                    },
                    { label: "Timezone", value: sys?.server?.timezone },
                    { label: "Encoding", value: sys?.server?.serverEncoding },
                    {
                      label: "Max connections",
                      value: sys?.server?.maxConnections,
                    },
                    {
                      label: "Uptime",
                      value: sys?.server?.uptimeHours
                        ? `${Math.floor(sys.server.uptimeHours / 24)}d ${Math.round(sys.server.uptimeHours % 24)}h`
                        : undefined,
                    },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex justify-between py-2.5 border-b border-[var(--border)] last:border-0"
                    >
                      <span className="text-xs text-muted">{row.label}</span>
                      <span
                        className={cn(
                          "text-xs text-primary font-medium text-right max-w-[60%] truncate",
                          row.mono && "mono",
                        )}
                      >
                        {row.value ?? "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <CardHeader
                  title="Key settings"
                  icon={<SlidersHorizontal size={15} />}
                />
                <div className="space-y-0">
                  {Object.entries(sys?.keySettings ?? {}).map(
                    ([key, value]) => (
                      <div
                        key={key}
                        className="flex justify-between py-2.5 border-b border-[var(--border)] last:border-0"
                      >
                        <code className="mono text-xs text-muted">{key}</code>
                        <code className="mono text-xs text-brand-500 font-medium">
                          {value}
                        </code>
                      </div>
                    ),
                  )}
                  {!Object.keys(sys?.keySettings ?? {}).length && (
                    <EmptyState title="No data" />
                  )}
                </div>
              </Card>
            </div>
          </TabPanel>

          <TabPanel value="settings">
            <div className="relative mb-4">
              <SearchIcon
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                value={settingSearch}
                onChange={(e) => setSettingSearch(e.target.value)}
                placeholder="Search settings (e.g. shared_buffers, work_mem)…"
                className="input pl-8 w-full max-w-md text-xs"
              />
            </div>
            {settingsLoading && !settingsData ? (
              <div className="h-40 skeleton rounded-xl" />
            ) : (
              <div className="space-y-2">
                {Object.entries(grouped)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([cat, items]) => (
                    <SettingsGroup key={cat} category={cat} settings={items} />
                  ))}
                {!Object.keys(grouped).length && (
                  <EmptyState title="No settings match" />
                )}
              </div>
            )}
          </TabPanel>

          <TabPanel value="databases">
            <Card>
              <DataTable
                loading={loading && !sys}
                data={(sys?.databases ?? []).filter((d) => !d.isTemplate)}
                keyFn={(d) => d.name}
                emptyMsg="No databases"
                columns={[
                  {
                    key: "name",
                    header: "Database",
                    render: (d) => (
                      <span className="mono text-xs text-primary font-medium">
                        {d.name}
                      </span>
                    ),
                  },
                  {
                    key: "owner",
                    header: "Owner",
                    width: "120px",
                    render: (d) => (
                      <span className="text-xs text-secondary">{d.owner}</span>
                    ),
                  },
                  {
                    key: "size",
                    header: "Size",
                    width: "100px",
                    align: "right",
                    render: (d) => (
                      <span className="text-xs text-primary font-medium">
                        {d.sizeHuman || fmtBytes(d.sizeBytes)}
                      </span>
                    ),
                  },
                  {
                    key: "conns",
                    header: "Connections",
                    width: "110px",
                    align: "right",
                    render: (d) => (
                      <span className="text-xs text-secondary">
                        {d.connections}
                      </span>
                    ),
                  },
                  {
                    key: "age",
                    header: "XID age",
                    width: "100px",
                    align: "right",
                    render: (d) => (
                      <span
                        className={cn(
                          "text-xs mono",
                          d.ageXid > 500_000_000
                            ? "text-yellow-400"
                            : "text-secondary",
                        )}
                      >
                        {(d.ageXid / 1_000_000).toFixed(0)}M
                      </span>
                    ),
                  },
                ]}
              />
            </Card>
          </TabPanel>

          <TabPanel value="extensions">
            <Card>
              <DataTable
                loading={loading && !sys}
                data={sys?.extensions ?? []}
                keyFn={(e) => e.name}
                emptyMsg="No extensions installed"
                columns={[
                  {
                    key: "name",
                    header: "Extension",
                    render: (e) => (
                      <span className="mono text-xs text-primary font-medium">
                        {e.name}
                      </span>
                    ),
                  },
                  {
                    key: "version",
                    header: "Version",
                    width: "90px",
                    render: (e) => (
                      <Badge variant="default" size="xs">
                        {e.version}
                      </Badge>
                    ),
                  },
                  {
                    key: "schema",
                    header: "Schema",
                    width: "110px",
                    render: (e) => (
                      <span className="text-xs text-secondary mono">
                        {e.schemaName}
                      </span>
                    ),
                  },
                  {
                    key: "comment",
                    header: "Description",
                    render: (e) => (
                      <span className="text-[11px] text-muted">
                        {e.comment ?? "—"}
                      </span>
                    ),
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
