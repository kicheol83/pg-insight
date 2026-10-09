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
  Shield,
  CheckCircle2,
  XCircle,
  Info,
  HelpCircle,
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
  LoadingState,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  TargetSelector,
} from "@/components/ui";
import { useQuery } from "@/hooks/useQuery";
import { useActiveTarget } from "@/store/app";
import { liveApi, securityApi } from "@/api/endpoints";
import { fmtBytes, cn } from "@/lib/format";
import { severityBadge } from "@/lib/colors";
import type { PgSetting, SecurityCheck } from "@/types/model";
import { useI18n, type MessageKey } from "@/i18n";

const SEVERITY_LABELS: Record<string, MessageKey> = {
  critical: "settings.severity.critical",
  warning: "settings.severity.warning",
  info: "settings.severity.info",
};

function SettingsGroup({
  category,
  settings,
}: {
  category: string;
  settings: PgSetting[];
}) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
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
          {t("settings.settingsCount", { count: settings.length })}
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
                      {t("settings.restartPending")}
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

function SecurityStatusIcon({ status }: { status: SecurityCheck["status"] }) {
  if (status === "ok")
    return <CheckCircle2 size={16} className="text-green-400 shrink-0" />;
  if (status === "warning")
    return <XCircle size={16} className="text-red-400 shrink-0" />;
  if (status === "info")
    return <Info size={16} className="text-blue-400 shrink-0" />;
  return <HelpCircle size={16} className="text-muted shrink-0" />;
}

function SecurityCheckCard({ check }: { check: SecurityCheck }) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        check.status === "warning"
          ? "border-red-300 dark:border-red-500/40 bg-red-50/50 dark:bg-red-500/5"
          : check.status === "unavailable"
            ? "border-[var(--border)] opacity-70"
            : "border-[var(--border)]",
      )}
    >
      <div className="flex items-start gap-3">
        <SecurityStatusIcon status={check.status} />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-primary">{check.title}</h3>
          <p className="text-xs text-secondary mt-1">{check.message}</p>

          {check.items && check.items.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {check.items.slice(0, 8).map((item, i) => (
                <code
                  key={i}
                  className="text-[10px] mono text-secondary bg-[var(--bg-subtle)] border border-[var(--border)] rounded px-1.5 py-0.5"
                >
                  {item}
                </code>
              ))}
              {check.items.length > 8 && (
                <span className="text-[10px] text-muted self-center">
                  {t("settings.moreItems", { count: check.items.length - 8 })}
                </span>
              )}
            </div>
          )}

          {check.recommendation && (
            <div className="mt-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] p-2.5">
              <p className="text-[11px] text-secondary">
                <span className="font-medium text-primary">
                  {`${t("settings.recommendation")} `}
                </span>
                {check.recommendation}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { activeTargetId } = useActiveTarget();
  const [settingSearch, setSettingSearch] = useState("");
  const { t } = useI18n();

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
  const {
    data: securityReport,
    loading: securityLoading,
    refetch: refetchSecurity,
  } = useQuery(() => securityApi.audit(activeTargetId ?? ""), {
    enabled: !!activeTargetId,
  });

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
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
        actions={
          <Button
            size="sm"
            variant="ghost"
            icon={<RefreshCw size={13} />}
            onClick={refetch}
            loading={loading}
          >
            {t("common.refresh")}
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
              title={t("settings.configRecommendations")}
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
                    {SEVERITY_LABELS[issue.severity]
                      ? t(SEVERITY_LABELS[issue.severity])
                      : issue.severity}
                  </span>
                  <div>
                    <div className="text-xs text-primary">
                      <code className="mono text-brand-500">
                        {issue.setting}
                      </code>
                      {" = "}
                      <code className="mono">{issue.current}</code>
                      <span className="text-muted">
                        {` → ${t("settings.recommendedValue")} `}
                      </span>
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
              {t("settings.tabServer")}
            </Tab>
            <Tab value="settings" icon={<SlidersHorizontal size={13} />}>
              pg_settings
            </Tab>
            <Tab value="databases" icon={<Database size={13} />}>
              {t("settings.tabDatabases")}
            </Tab>
            <Tab value="extensions" icon={<Puzzle size={13} />}>
              {t("settings.tabExtensions")}
            </Tab>
            <Tab value="security" icon={<Shield size={13} />}>
              {t("settings.tabSecurity")}
            </Tab>
          </TabList>

          <TabPanel value="server">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <Card>
                <CardHeader
                  title={t("settings.serverInfo")}
                  icon={<Server size={15} />}
                />
                <div className="space-y-0">
                  {[
                    {
                      label: t("settings.version"),
                      value: sys?.server?.version,
                    },
                    {
                      label: t("settings.dataDirectory"),
                      value: sys?.server?.dataDirectory,
                      mono: true,
                    },
                    {
                      label: t("settings.timezone"),
                      value: sys?.server?.timezone,
                    },
                    {
                      label: t("settings.encoding"),
                      value: sys?.server?.serverEncoding,
                    },
                    {
                      label: t("settings.maxConnections"),
                      value: sys?.server?.maxConnections,
                    },
                    {
                      label: t("settings.uptime"),
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
                  title={t("settings.keySettings")}
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
                    <EmptyState title={t("common.noData")} />
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
                placeholder={t("settings.searchPlaceholder")}
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
                  <EmptyState title={t("settings.noSettingsMatch")} />
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
                emptyMsg={t("settings.noDatabases")}
                columns={[
                  {
                    key: "name",
                    header: t("nav.database"),
                    render: (d) => (
                      <span className="mono text-xs text-primary font-medium">
                        {d.name}
                      </span>
                    ),
                  },
                  {
                    key: "owner",
                    header: t("settings.colOwner"),
                    width: "120px",
                    render: (d) => (
                      <span className="text-xs text-secondary">{d.owner}</span>
                    ),
                  },
                  {
                    key: "size",
                    header: t("settings.colSize"),
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
                    header: t("nav.connections"),
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
                    header: t("settings.colXidAge"),
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
                emptyMsg={t("settings.noExtensions")}
                columns={[
                  {
                    key: "name",
                    header: t("settings.colExtension"),
                    render: (e) => (
                      <span className="mono text-xs text-primary font-medium">
                        {e.name}
                      </span>
                    ),
                  },
                  {
                    key: "version",
                    header: t("settings.version"),
                    width: "90px",
                    render: (e) => (
                      <Badge variant="default" size="xs">
                        {e.version}
                      </Badge>
                    ),
                  },
                  {
                    key: "schema",
                    header: t("settings.colSchema"),
                    width: "110px",
                    render: (e) => (
                      <span className="text-xs text-secondary mono">
                        {e.schemaName}
                      </span>
                    ),
                  },
                  {
                    key: "comment",
                    header: t("settings.colDescription"),
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

          <TabPanel value="security">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-muted">{t("settings.securityNote")}</p>
              <Button
                size="xs"
                variant="ghost"
                icon={<RefreshCw size={12} />}
                onClick={refetchSecurity}
                loading={securityLoading}
              >
                {t("settings.recheck")}
              </Button>
            </div>
            {securityLoading && !securityReport ? (
              <Card>
                <LoadingState message={t("settings.securityRunning")} />
              </Card>
            ) : !securityReport?.checks?.length ? (
              <Card>
                <EmptyState
                  icon={<Shield size={28} />}
                  title={t("common.noData")}
                />
              </Card>
            ) : (
              <div className="space-y-3">
                {securityReport.checks.map((check) => (
                  <SecurityCheckCard key={check.id} check={check} />
                ))}
              </div>
            )}
          </TabPanel>
        </Tabs>
      </PageContent>
    </>
  );
}
