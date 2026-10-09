import { useState } from "react";
import {
  Bell,
  Plus,
  RefreshCw,
  Trash2,
  Check,
  BellRing,
  ScrollText,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/layout/AppLayout";
import {
  Card,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  TargetSelector,
  useToast,
} from "@/components/ui";
import { useQuery } from "@/hooks/useQuery";
import { useActiveTarget } from "@/store/app";
import { alertsApi } from "@/api/endpoints";
import { fmtRelative, cn } from "@/lib/format";
import { severityBadge } from "@/lib/colors";
import { AddRuleModal, ALERT_METRICS, ALERT_SEVERITIES } from "./AddRuleModal";
import { useI18n } from "@/i18n";
import type { AlertRule, AlertEvent } from "@/types/model";

export default function AlertsPage() {
  const { activeTargetId } = useActiveTarget();
  const toast = useToast();
  const { t, locale } = useI18n();
  const [addOpen, setAddOpen] = useState(false);

  const {
    data: rules,
    loading: rulesLoading,
    refetch: refetchRules,
  } = useQuery(() => alertsApi.getRules(activeTargetId ?? ""), {
    refreshInterval: 30_000,
    enabled: !!activeTargetId,
  });
  const {
    data: events,
    loading: eventsLoading,
    refetch: refetchEvents,
  } = useQuery(() => alertsApi.getEvents(activeTargetId ?? "", 100), {
    refreshInterval: 15_000,
    enabled: !!activeTargetId,
  });
  const { data: activeEvents } = useQuery(
    () => alertsApi.getActive(activeTargetId ?? ""),
    { refreshInterval: 10_000, enabled: !!activeTargetId },
  );

  const metricLabel = (m: string) => {
    const key = ALERT_METRICS.find((x) => x.value === m)?.labelKey;
    return key ? t(key) : m;
  };

  const severityLabel = (s: string) => {
    const key = ALERT_SEVERITIES.find((x) => x.value === s)?.labelKey;
    return key ? t(key) : s;
  };

  const handleDeleteRule = async (rule: AlertRule) => {
    if (!confirm(t("alerts.deleteConfirm", { name: rule.name }))) return;
    try {
      await alertsApi.deleteRule(rule.id);
      toast({ type: "success", title: t("alerts.ruleDeleted") });
      refetchRules();
    } catch (err) {
      toast({
        type: "error",
        title: t("alerts.failed"),
        message: (err as Error).message,
      });
    }
  };

  const handleAck = async (ev: AlertEvent) => {
    try {
      await alertsApi.acknowledge(ev.id);
      refetchEvents();
    } catch (err) {
      toast({
        type: "error",
        title: t("alerts.ackFailed"),
        message: (err as Error).message,
      });
    }
  };

  return (
    <>
      <TopBar
        title={t("nav.alerts")}
        subtitle={t("alerts.subtitle")}
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => setAddOpen(true)}
            disabled={!activeTargetId}
          >
            {t("alerts.newRule")}
          </Button>
        }
      />
      <PageContent>
        <div className="flex items-center gap-3 mb-5">
          <TargetSelector />
        </div>

        {/* Active alerts banner */}
        {(activeEvents?.length ?? 0) > 0 && (
          <Card className="mb-5 border-red-300 dark:border-red-500/40">
            <div className="flex items-center gap-2 mb-3">
              <BellRing size={16} className="text-red-400" />
              <h3 className="text-sm font-semibold text-red-400">
                {t(
                  (activeEvents?.length ?? 0) === 1
                    ? "alerts.activeOne"
                    : "alerts.activeMany",
                  { count: activeEvents?.length ?? 0 },
                )}
              </h3>
            </div>
            <div className="space-y-2">
              {(activeEvents ?? []).map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20"
                >
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0",
                      severityBadge(ev.rule.severity),
                    )}
                  >
                    {severityLabel(ev.rule.severity)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-primary truncate">
                      {ev.message}
                    </div>
                    <div className="text-[10px] text-muted">
                      {t("alerts.triggeredAt", {
                        time: fmtRelative(ev.triggeredAt, locale),
                      })}
                    </div>
                  </div>
                  {!ev.acknowledged && (
                    <Button
                      size="xs"
                      variant="outline"
                      icon={<Check size={11} />}
                      onClick={() => handleAck(ev)}
                    >
                      {t("alerts.ack")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        <Tabs defaultValue="rules">
          <TabList>
            <Tab value="rules" icon={<Bell size={13} />}>
              {t("alerts.rulesTab", { count: rules?.length ?? 0 })}
            </Tab>
            <Tab value="history" icon={<ScrollText size={13} />}>
              {t("alerts.historyTab", { count: events?.length ?? 0 })}
            </Tab>
          </TabList>

          <TabPanel value="rules">
            <Card>
              <DataTable<AlertRule>
                loading={rulesLoading && !rules}
                data={rules ?? []}
                keyFn={(r) => r.id}
                emptyMsg={t("alerts.noRules")}
                emptyIcon={<Bell size={32} />}
                columns={[
                  {
                    key: "name",
                    header: t("alerts.col.rule"),
                    render: (r) => (
                      <div>
                        <div className="text-xs font-medium text-primary">
                          {r.name}
                        </div>
                        <div className="text-[10px] text-muted">
                          {metricLabel(r.metric)}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "condition",
                    header: t("alerts.col.condition"),
                    width: "160px",
                    render: (r) => (
                      <code className="text-[11px] mono text-secondary">
                        {r.metric}{" "}
                        {{ gt: ">", gte: "≥", lt: "<", lte: "≤" }[r.operator]}{" "}
                        {r.threshold}
                      </code>
                    ),
                  },
                  {
                    key: "severity",
                    header: t("alerts.col.severity"),
                    width: "100px",
                    render: (r) => (
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
                          severityBadge(r.severity),
                        )}
                      >
                        {severityLabel(r.severity)}
                      </span>
                    ),
                  },
                  {
                    key: "status",
                    header: t("alerts.col.status"),
                    width: "90px",
                    render: (r) => (
                      <Badge
                        variant={r.enabled ? "success" : "default"}
                        size="xs"
                        dot={r.enabled}
                      >
                        {r.enabled ? t("alerts.on") : t("alerts.off")}
                      </Badge>
                    ),
                  },
                  {
                    key: "channels",
                    header: t("alerts.col.notify"),
                    width: "90px",
                    render: (r) => (
                      <span className="text-xs text-muted">
                        {r.notifyChannels.length
                          ? t("alerts.webhookCount", {
                              count: r.notifyChannels.length,
                            })
                          : t("alerts.inApp")}
                      </span>
                    ),
                  },
                  {
                    key: "actions",
                    header: "",
                    width: "50px",
                    align: "right",
                    render: (r) => (
                      <Button
                        size="xs"
                        variant="danger"
                        icon={<Trash2 size={11} />}
                        onClick={() => handleDeleteRule(r)}
                      />
                    ),
                  },
                ]}
              />
            </Card>
          </TabPanel>

          <TabPanel value="history">
            <Card>
              <DataTable<AlertEvent>
                loading={eventsLoading && !events}
                data={events ?? []}
                keyFn={(e) => e.id}
                emptyMsg={t("alerts.noEvents")}
                emptyIcon={<ScrollText size={32} />}
                columns={[
                  {
                    key: "severity",
                    header: "",
                    width: "90px",
                    render: (e) => (
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
                          severityBadge(e.rule.severity),
                        )}
                      >
                        {severityLabel(e.rule.severity)}
                      </span>
                    ),
                  },
                  {
                    key: "message",
                    header: t("alerts.col.alert"),
                    render: (e) => (
                      <div>
                        <div className="text-xs text-primary">{e.message}</div>
                        <div className="text-[10px] text-muted">
                          {e.rule.name}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "value",
                    header: t("alerts.col.value"),
                    width: "90px",
                    align: "right",
                    render: (e) => (
                      <span className="text-xs mono text-secondary">
                        {e.currentValue}
                      </span>
                    ),
                  },
                  {
                    key: "triggered",
                    header: t("alerts.col.triggered"),
                    width: "110px",
                    align: "right",
                    render: (e) => (
                      <span className="text-xs text-muted">
                        {fmtRelative(e.triggeredAt, locale)}
                      </span>
                    ),
                  },
                  {
                    key: "status",
                    header: t("alerts.col.status"),
                    width: "100px",
                    align: "right",
                    render: (e) =>
                      e.resolvedAt ? (
                        <Badge variant="success" size="xs">
                          {t("alerts.resolved")}
                        </Badge>
                      ) : (
                        <Badge variant="error" size="xs" dot>
                          {t("alerts.active")}
                        </Badge>
                      ),
                  },
                ]}
              />
            </Card>
          </TabPanel>
        </Tabs>
      </PageContent>

      {activeTargetId && (
        <AddRuleModal
          targetId={activeTargetId}
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onAdded={refetchRules}
        />
      )}
    </>
  );
}
