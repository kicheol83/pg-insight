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
import { AddRuleModal, ALERT_METRICS } from "./AddRuleModal";
import type { AlertRule, AlertEvent } from "@/types/model";

export default function AlertsPage() {
  const { activeTargetId } = useActiveTarget();
  const toast = useToast();
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

  const metricLabel = (m: string) =>
    ALERT_METRICS.find((x) => x.value === m)?.label ?? m;

  const handleDeleteRule = async (rule: AlertRule) => {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    try {
      await alertsApi.deleteRule(rule.id);
      toast({ type: "success", title: "Rule deleted" });
      refetchRules();
    } catch (err) {
      toast({
        type: "error",
        title: "Failed",
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
        title: "Failed to acknowledge",
        message: (err as Error).message,
      });
    }
  };

  return (
    <>
      <TopBar
        title="Alerts"
        subtitle="Threshold rules & notification history"
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => setAddOpen(true)}
            disabled={!activeTargetId}
          >
            New rule
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
                {activeEvents?.length} active{" "}
                {(activeEvents?.length ?? 0) === 1 ? "alert" : "alerts"}
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
                    {ev.rule.severity}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-primary truncate">
                      {ev.message}
                    </div>
                    <div className="text-[10px] text-muted">
                      Triggered {fmtRelative(ev.triggeredAt)}
                    </div>
                  </div>
                  {!ev.acknowledged && (
                    <Button
                      size="xs"
                      variant="outline"
                      icon={<Check size={11} />}
                      onClick={() => handleAck(ev)}
                    >
                      Ack
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
              Rules ({rules?.length ?? 0})
            </Tab>
            <Tab value="history" icon={<ScrollText size={13} />}>
              History ({events?.length ?? 0})
            </Tab>
          </TabList>

          <TabPanel value="rules">
            <Card>
              <DataTable<AlertRule>
                loading={rulesLoading && !rules}
                data={rules ?? []}
                keyFn={(r) => r.id}
                emptyMsg="No alert rules yet"
                emptyIcon={<Bell size={32} />}
                columns={[
                  {
                    key: "name",
                    header: "Rule",
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
                    header: "Condition",
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
                    header: "Severity",
                    width: "100px",
                    render: (r) => (
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
                          severityBadge(r.severity),
                        )}
                      >
                        {r.severity}
                      </span>
                    ),
                  },
                  {
                    key: "status",
                    header: "Status",
                    width: "90px",
                    render: (r) => (
                      <Badge
                        variant={r.enabled ? "success" : "default"}
                        size="xs"
                        dot={r.enabled}
                      >
                        {r.enabled ? "on" : "off"}
                      </Badge>
                    ),
                  },
                  {
                    key: "channels",
                    header: "Notify",
                    width: "90px",
                    render: (r) => (
                      <span className="text-xs text-muted">
                        {r.notifyChannels.length
                          ? `${r.notifyChannels.length} webhook`
                          : "in-app"}
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
                emptyMsg="No alert events yet"
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
                        {e.rule.severity}
                      </span>
                    ),
                  },
                  {
                    key: "message",
                    header: "Alert",
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
                    header: "Value",
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
                    header: "Triggered",
                    width: "110px",
                    align: "right",
                    render: (e) => (
                      <span className="text-xs text-muted">
                        {fmtRelative(e.triggeredAt)}
                      </span>
                    ),
                  },
                  {
                    key: "status",
                    header: "Status",
                    width: "100px",
                    align: "right",
                    render: (e) =>
                      e.resolvedAt ? (
                        <Badge variant="success" size="xs">
                          resolved
                        </Badge>
                      ) : (
                        <Badge variant="error" size="xs" dot>
                          active
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
