import { useState } from "react";
import {
  Database,
  Plus,
  Trash2,
  RefreshCw,
  Pause,
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/layout/AppLayout";
import { Card, Button, Badge, EmptyState, useToast } from "@/components/ui";
import { useQuery } from "@/hooks/useQuery";
import { targetsApi } from "@/api/endpoints";
import { fmtRelative, cn } from "@/lib/format";
import { statusBadge } from "@/lib/colors";
import { AddTargetModal } from "./AddTargetModal";
import type { Target } from "@/types/model";
import { useI18n, type MessageKey } from "@/i18n";

const STATUS_LABELS: Record<string, MessageKey> = {
  active: "targets.status.active",
  connecting: "targets.status.connecting",
  error: "targets.status.error",
  paused: "targets.status.paused",
};

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "active":
      return <CheckCircle2 size={14} className="text-green-400" />;
    case "error":
      return <XCircle size={14} className="text-red-400" />;
    case "connecting":
      return <Loader2 size={14} className="text-blue-400 animate-spin-c" />;
    default:
      return <Database size={14} className="text-slate-400" />;
  }
}

export default function TargetsPage() {
  const toast = useToast();
  const { t, locale } = useI18n();
  const [addOpen, setAddOpen] = useState(false);

  const {
    data: targets,
    loading,
    refetch,
  } = useQuery<Target[]>(() => targetsApi.list(), { refreshInterval: 10_000 });

  const handleRemove = async (target: Target) => {
    if (!confirm(t("targets.removeConfirm", { name: target.name }))) return;
    try {
      await targetsApi.remove(target.id);
      toast({ type: "success", title: t("targets.removed") });
      refetch();
    } catch (err) {
      toast({
        type: "error",
        title: t("targets.removeFailed"),
        message: (err as Error).message,
      });
    }
  };

  const handlePauseResume = async (target: Target) => {
    try {
      if (target.status === "paused") await targetsApi.resume(target.id);
      else await targetsApi.pause(target.id);
      refetch();
    } catch (err) {
      toast({
        type: "error",
        title: t("targets.actionFailed"),
        message: (err as Error).message,
      });
    }
  };

  return (
    <>
      <TopBar
        title={t("nav.targets")}
        subtitle={t("targets.subtitle")}
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => setAddOpen(true)}
          >
            {t("targets.add")}
          </Button>
        }
      />
      <PageContent>
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          {[
            {
              label: t("targets.statTotal"),
              value: targets?.length ?? 0,
              icon: <Database size={15} />,
            },
            {
              label: t("targets.statActive"),
              value: targets?.filter((t) => t.status === "active").length ?? 0,
              icon: <CheckCircle2 size={15} className="text-green-400" />,
            },
            {
              label: t("targets.statErrors"),
              value: targets?.filter((t) => t.status === "error").length ?? 0,
              icon: <XCircle size={15} className="text-red-400" />,
            },
            {
              label: t("targets.statCollecting"),
              value: targets?.filter((t) => t.isCollecting).length ?? 0,
              icon: <RefreshCw size={15} className="text-brand-500" />,
            },
          ].map((s) => (
            <Card
              key={s.label}
              padding="sm"
              className="flex items-center gap-3"
            >
              <div className="p-2 bg-[var(--bg-subtle)] rounded-lg">
                {s.icon}
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">{s.value}</div>
                <div className="text-xs text-muted">{s.label}</div>
              </div>
            </Card>
          ))}
        </div>

        {/* Targets grid */}
        {loading && !targets ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <Card key={i}>
                <div className="h-40 skeleton rounded" />
              </Card>
            ))}
          </div>
        ) : !targets?.length ? (
          <EmptyState
            icon={<Database size={40} />}
            title={t("target.none")}
            message={t("targets.emptyMessage")}
            action={
              <Button
                variant="primary"
                icon={<Plus size={14} />}
                onClick={() => setAddOpen(true)}
              >
                {t("target.add")}
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {targets.map((target) => (
              <Card key={target.id} hover className="flex flex-col">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <StatusIcon status={target.status} />
                    <div>
                      <h3 className="font-semibold text-primary text-sm">
                        {target.name}
                      </h3>
                      <p className="text-xs text-muted mono">
                        {target.host}:{target.port}/{target.database}
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full border font-medium",
                      statusBadge(target.status),
                    )}
                  >
                    {STATUS_LABELS[target.status]
                      ? t(STATUS_LABELS[target.status])
                      : target.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-[var(--bg-subtle)] rounded-lg p-2.5">
                    <div className="text-[10px] text-muted mb-1">
                      {t("targets.pool")}
                    </div>
                    <div className="text-sm font-bold text-primary">
                      {target.poolTotal}
                    </div>
                    <div className="text-[10px] text-muted">
                      {t("targets.poolIdle", { count: target.poolIdle })}
                    </div>
                  </div>
                  <div className="bg-[var(--bg-subtle)] rounded-lg p-2.5">
                    <div className="text-[10px] text-muted mb-1">
                      {t("targets.pgVersion")}
                    </div>
                    <div className="text-sm font-bold text-primary">
                      {target.pgVersion ?? "—"}
                    </div>
                  </div>
                  <div className="bg-[var(--bg-subtle)] rounded-lg p-2.5">
                    <div className="text-[10px] text-muted mb-1">
                      {t("targets.lastCollected")}
                    </div>
                    <div className="text-[11px] font-bold text-primary">
                      {target.lastCollectedAt
                        ? fmtRelative(target.lastCollectedAt, locale)
                        : "—"}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mb-4">
                  <Badge
                    variant={target.hasStatStatements ? "success" : "default"}
                    size="xs"
                  >
                    <Zap size={9} /> pg_stat_statements
                  </Badge>
                  {target.isCollecting && (
                    <Badge variant="info" size="xs" dot>
                      {t("targets.collecting")}
                    </Badge>
                  )}
                </div>

                {target.errorMessage && (
                  <div className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 mb-3 mono">
                    {target.errorMessage}
                  </div>
                )}

                <div className="flex gap-2 mt-auto pt-3 border-t border-[var(--border)]">
                  <Button
                    size="xs"
                    variant="ghost"
                    icon={
                      target.status === "paused" ? (
                        <Play size={12} />
                      ) : (
                        <Pause size={12} />
                      )
                    }
                    onClick={() => handlePauseResume(target)}
                  >
                    {target.status === "paused"
                      ? t("targets.resume")
                      : t("targets.pause")}
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    icon={<RefreshCw size={12} />}
                    onClick={() => targetsApi.refresh(target.id)}
                  >
                    {t("common.refresh")}
                  </Button>
                  <div className="flex-1" />
                  <Button
                    size="xs"
                    variant="danger"
                    icon={<Trash2 size={12} />}
                    onClick={() => handleRemove(target)}
                  />
                </div>
              </Card>
            ))}
          </div>
        )}
      </PageContent>

      <AddTargetModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={refetch}
      />
    </>
  );
}
