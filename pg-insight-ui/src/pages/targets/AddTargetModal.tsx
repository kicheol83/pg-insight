import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, CheckCircle2, XCircle } from "lucide-react";
import { Modal, Input, Select, Button, useToast } from "@/components/ui";
import { targetsApi } from "@/api/endpoints";
import { useActiveTarget } from "@/store/app";
import type { ConnectionTestResult } from "@/types/model";
import { cn } from "@/lib/format";
import { useI18n } from "@/i18n";

interface AddTargetModalProps {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}

export function AddTargetModal({
  open,
  onClose,
  onAdded,
}: AddTargetModalProps) {
  const toast = useToast();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { setActiveTarget } = useActiveTarget();
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(
    null,
  );
  const [form, setForm] = useState({
    name: "",
    host: "localhost",
    port: "5432",
    database: "postgres",
    username: "postgres",
    password: "",
    sslMode: "require",
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const payload = () => ({
    host: form.host,
    port: parseInt(form.port, 10),
    database: form.database,
    username: form.username,
    password: form.password,
    sslMode: form.sslMode,
  });

  const handleTest = async () => {
    setLoading(true);
    try {
      setTestResult(await targetsApi.test(payload()));
    } catch (err) {
      setTestResult({ success: false, errorMessage: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    setLoading(true);
    try {
      const target = await targetsApi.create({ name: form.name, ...payload() });
      toast({
        type: "success",
        title: t("targets.added"),
        message: t("targets.addedMessage", { name: form.name }),
      });
      setActiveTarget(target.id);
      onAdded();
      handleClose();
      navigate("/diagnostics");
    } catch (err) {
      toast({
        type: "error",
        title: t("targets.addFailed"),
        message: (err as Error).message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setTestResult(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t("target.add")}
      size="lg"
      footer={
        <div className="flex gap-2 w-full">
          <Button variant="ghost" onClick={handleClose}>
            {t("common.cancel")}
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            onClick={handleTest}
            loading={loading && !testResult?.success}
          >
            {t("targets.testConnection")}
          </Button>
          {testResult?.success && (
            <Button
              variant="primary"
              icon={<Plus size={14} />}
              onClick={handleAdd}
              loading={loading}
            >
              {t("targets.add")}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <Input
          label={t("targets.displayName")}
          placeholder={t("targets.displayNamePlaceholder")}
          value={form.name}
          onChange={set("name")}
        />
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Input
              label={t("targets.host")}
              placeholder={t("targets.hostPlaceholder")}
              value={form.host}
              onChange={set("host")}
            />
          </div>
          <Input
            label={t("targets.port")}
            type="number"
            value={form.port}
            onChange={set("port")}
          />
        </div>
        <Input
          label={t("targets.database")}
          value={form.database}
          onChange={set("database")}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={t("targets.username")}
            value={form.username}
            onChange={set("username")}
          />
          <Input
            label={t("targets.password")}
            type="password"
            value={form.password}
            onChange={set("password")}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-secondary mb-1.5">
            {t("targets.sslMode")}
          </label>
          <Select
            value={form.sslMode}
            onChange={(v) => setForm((f) => ({ ...f, sslMode: v }))}
            options={[
              { value: "disable", label: t("targets.ssl.disable") },
              { value: "require", label: t("targets.ssl.require") },
              { value: "verify-ca", label: t("targets.ssl.verifyCa") },
              { value: "verify-full", label: t("targets.ssl.verifyFull") },
            ]}
          />
        </div>

        {testResult && (
          <div
            className={cn(
              "rounded-lg p-3.5 border text-sm",
              testResult.success
                ? "bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30"
                : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30",
            )}
          >
            {testResult.success ? (
              <div className="flex items-start gap-2">
                <CheckCircle2
                  size={15}
                  className="text-green-500 dark:text-green-400 mt-0.5 shrink-0"
                />
                <div>
                  <p className="font-medium text-green-700 dark:text-green-400">
                    {t("targets.testSuccess")}
                  </p>
                  <div className="text-xs text-green-600 dark:text-green-500 mt-1">
                    {t("targets.testDetails", {
                      version: testResult.pgVersion ?? "",
                      latency: testResult.latencyMs ?? "",
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <XCircle size={15} className="text-red-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-red-600 dark:text-red-400">
                    {t("targets.testFailed")}
                  </p>
                  <p className="text-xs text-red-500 dark:text-red-400 mt-1 mono">
                    {testResult.errorMessage}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="rounded-lg p-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-xs text-blue-600 dark:text-blue-400">
          <p className="font-medium mb-1">{t("targets.requiredPermission")}</p>
          <code className="block text-[11px] mono bg-blue-100 dark:bg-blue-900/30 rounded px-2 py-1">
            GRANT pg_monitor TO {form.username || "your_user"};
          </code>
        </div>
      </div>
    </Modal>
  );
}
