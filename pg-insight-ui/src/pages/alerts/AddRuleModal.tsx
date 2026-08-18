import { useState } from "react";
import { Plus } from "lucide-react";
import { Modal, Input, Select, Button, useToast } from "@/components/ui";
import { alertsApi } from "@/api/endpoints";

export const ALERT_METRICS = [
  { value: "connection_usage_pct", label: "Connection usage %" },
  { value: "active_queries", label: "Active queries" },
  { value: "idle_in_transaction", label: "Idle in transaction count" },
  { value: "waiting_locks", label: "Waiting locks" },
  { value: "longest_query_ms", label: "Longest query (ms)" },
  { value: "blocked_sessions", label: "Blocked sessions" },
  { value: "deadlocks_delta", label: "New deadlocks" },
  { value: "cache_hit_ratio", label: "Cache hit ratio" },
  { value: "replication_lag_bytes", label: "Replication lag (bytes)" },
  { value: "xid_age", label: "XID age" },
  { value: "table_bloat_ratio", label: "Table bloat ratio" },
  { value: "unused_index_size", label: "Unused index size (bytes)" },
  { value: "wal_size_bytes", label: "WAL size (bytes)" },
  { value: "slow_query_count", label: "Slow query count" },
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
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    metric: "connection_usage_pct",
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
        notifyChannels: form.webhookUrl ? [form.webhookUrl] : [],
      });
      toast({ type: "success", title: "Alert rule created" });
      onAdded();
      onClose();
    } catch (err) {
      toast({
        type: "error",
        title: "Failed to create rule",
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
      title="New Alert Rule"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<Plus size={14} />}
            onClick={handleAdd}
            loading={loading}
          >
            Create rule
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Rule name"
          placeholder="High connection usage"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <div>
          <label className="block text-xs font-medium text-secondary mb-1.5">
            Metric
          </label>
          <Select
            value={form.metric}
            onChange={(v) => setForm((f) => ({ ...f, metric: v }))}
            options={ALERT_METRICS}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">
              Condition
            </label>
            <Select
              value={form.operator}
              onChange={(v) => setForm((f) => ({ ...f, operator: v }))}
              options={[
                { value: "gt", label: "> greater than" },
                { value: "gte", label: "≥ at least" },
                { value: "lt", label: "< less than" },
                { value: "lte", label: "≤ at most" },
              ]}
            />
          </div>
          <Input
            label="Threshold"
            type="number"
            value={form.threshold}
            onChange={(e) =>
              setForm((f) => ({ ...f, threshold: e.target.value }))
            }
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-secondary mb-1.5">
            Severity
          </label>
          <Select
            value={form.severity}
            onChange={(v) => setForm((f) => ({ ...f, severity: v }))}
            options={[
              { value: "info", label: "Info" },
              { value: "warning", label: "Warning" },
              { value: "critical", label: "Critical" },
            ]}
          />
        </div>
        <Input
          label="Webhook URL (optional)"
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
