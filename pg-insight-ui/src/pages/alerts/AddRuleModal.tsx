import { useState } from "react";
import { Plus } from "lucide-react";
import { Modal, Input, Select, Button, useToast } from "@/components/ui";
import { alertsApi } from "@/api/endpoints";
import { useI18n, type MessageKey } from "@/i18n";

export const ALERT_METRICS: Array<{ value: string; labelKey: MessageKey }> = [
  {
    value: "connection_utilization_pct",
    labelKey: "alerts.metric.connectionUsagePct",
  },
  { value: "active_query_count", labelKey: "alerts.metric.activeQueries" },
  { value: "long_running_query_ms", labelKey: "alerts.metric.longestQueryMs" },
  { value: "idle_in_tx_count", labelKey: "alerts.metric.idleInTransaction" },
  { value: "idle_in_tx_max_ms", labelKey: "alerts.metric.idleInTxMaxMs" },
  { value: "slow_query_count", labelKey: "alerts.metric.slowQueryCount" },
  { value: "lock_wait_count", labelKey: "alerts.metric.waitingLocks" },
  { value: "lock_wait_max_ms", labelKey: "alerts.metric.lockWaitMaxMs" },
  { value: "deadlocks_delta", labelKey: "alerts.metric.deadlocksDelta" },
  { value: "bloat_pct_max", labelKey: "alerts.metric.tableBloatRatio" },
  { value: "xid_age_max", labelKey: "alerts.metric.xidAge" },
  {
    value: "replication_lag_bytes",
    labelKey: "alerts.metric.replicationLagBytes",
  },
  { value: "cache_hit_ratio", labelKey: "alerts.metric.cacheHitRatio" },
  {
    value: "checkpoint_pressure",
    labelKey: "alerts.metric.checkpointPressure",
  },
  {
    value: "sync_standbys_missing",
    labelKey: "alerts.metric.syncStandbysMissing",
  },
  { value: "wal_archive_failing", labelKey: "alerts.metric.walArchiveFailing" },
  {
    value: "wal_archive_ready_count",
    labelKey: "alerts.metric.walArchiveReadyCount",
  },
  {
    value: "inactive_slot_wal_bytes",
    labelKey: "alerts.metric.inactiveSlotWalBytes",
  },
];

export const ALERT_SEVERITIES: Array<{ value: string; labelKey: MessageKey }> =
  [
    { value: "info", labelKey: "alerts.severity.info" },
    { value: "warning", labelKey: "alerts.severity.warning" },
    { value: "critical", labelKey: "alerts.severity.critical" },
  ];

interface AddRuleModalProps {
  targetId: string;
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}

export function AddRuleModal({
  targetId,
  open,
  onClose,
  onAdded,
}: AddRuleModalProps) {
  const toast = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    metric: "connection_utilization_pct",
    operator: "gt",
    threshold: "80",
    severity: "warning",
    webhookUrl: "",
  });

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    setLoading(true);
    try {
      await alertsApi.createRule(targetId, {
        name: form.name,
        metric: form.metric,
        operator: form.operator,
        threshold: parseFloat(form.threshold),
        severity: form.severity,
        notifyChannels: form.webhookUrl.trim()
          ? [`webhook:${form.webhookUrl.trim()}`]
          : [],
      });
      toast({ type: "success", title: t("alerts.ruleCreated") });
      onAdded();
      onClose();
    } catch (err) {
      toast({
        type: "error",
        title: t("alerts.createFailed"),
        message: (err as Error).message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("alerts.modalTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            icon={<Plus size={14} />}
            onClick={handleAdd}
            loading={loading}
          >
            {t("alerts.createRule")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label={t("alerts.ruleName")}
          placeholder={t("alerts.ruleNamePlaceholder")}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <div>
          <label className="block text-xs font-medium text-secondary mb-1.5">
            {t("alerts.metric")}
          </label>
          <Select
            value={form.metric}
            onChange={(v) => setForm((f) => ({ ...f, metric: v }))}
            options={ALERT_METRICS.map((m) => ({
              value: m.value,
              label: t(m.labelKey),
            }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">
              {t("alerts.col.condition")}
            </label>
            <Select
              value={form.operator}
              onChange={(v) => setForm((f) => ({ ...f, operator: v }))}
              options={[
                { value: "gt", label: t("alerts.operator.gt") },
                { value: "gte", label: t("alerts.operator.gte") },
                { value: "lt", label: t("alerts.operator.lt") },
                { value: "lte", label: t("alerts.operator.lte") },
              ]}
            />
          </div>
          <Input
            label={t("alerts.threshold")}
            type="number"
            value={form.threshold}
            onChange={(e) =>
              setForm((f) => ({ ...f, threshold: e.target.value }))
            }
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-secondary mb-1.5">
            {t("alerts.col.severity")}
          </label>
          <Select
            value={form.severity}
            onChange={(v) => setForm((f) => ({ ...f, severity: v }))}
            options={ALERT_SEVERITIES.map((s) => ({
              value: s.value,
              label: t(s.labelKey),
            }))}
          />
        </div>
        <Input
          label={t("alerts.webhookUrl")}
          placeholder="https://hooks.slack.com/…"
          value={form.webhookUrl}
          onChange={(e) =>
            setForm((f) => ({ ...f, webhookUrl: e.target.value }))
          }
        />
      </div>
    </Modal>
  );
}
