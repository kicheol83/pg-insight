import { useState } from "react";
import {
  HardDriveDownload,
  Play,
  Trash2,
  Download,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
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
  TargetSelector,
  useToast,
} from "@/components/ui";
import { useQuery } from "@/hooks/useQuery";
import { useActiveTarget } from "@/store/app";
import { backupsApi } from "@/api/endpoints";
import { fmtBytes, fmtRelative } from "@/lib/format";
import type { Backup } from "@/types/model";
import { useI18n } from "@/i18n";

function StatusBadge({ status }: { status: Backup["status"] }) {
  const { t } = useI18n();
  if (status === "completed")
    return (
      <Badge variant="success" size="xs">
        <CheckCircle2 size={10} /> {t("backups.status.completed")}
      </Badge>
    );
  if (status === "failed")
    return (
      <Badge variant="error" size="xs">
        <XCircle size={10} /> {t("backups.status.failed")}
      </Badge>
    );
  return (
    <Badge variant="info" size="xs" dot>
      <Loader2 size={10} className="animate-spin-c" />{" "}
      {t("backups.status.running")}
    </Badge>
  );
}

function duration(startedAt: string, completedAt: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const sec = Math.round((end - start) / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

export default function BackupsPage() {
  const { activeTargetId } = useActiveTarget();
  const toast = useToast();
  const { t, locale } = useI18n();
  const [starting, setStarting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data, loading, refetch } = useQuery(
    () => backupsApi.list(activeTargetId ?? ""),
    { refreshInterval: 5_000, enabled: !!activeTargetId },
  );

  const hasRunning = (data ?? []).some((b) => b.status === "running");

  if (!activeTargetId) {
    return (
      <>
        <TopBar
          title={t("nav.backups")}
          subtitle={t("backups.subtitleShort")}
        />
        <PageContent>
          <div className="flex items-center gap-3 mb-5">
            <TargetSelector />
          </div>
          <EmptyState
            icon={<HardDriveDownload size={32} />}
            title={t("backups.noTarget")}
          />
        </PageContent>
      </>
    );
  }

  const handleStart = async () => {
    setStarting(true);
    try {
      await backupsApi.start(activeTargetId);
      toast({
        type: "success",
        title: t("backups.started"),
        message: t("backups.startedMessage"),
      });
      refetch();
    } catch (err) {
      toast({
        type: "error",
        title: t("backups.startFailed"),
        message: (err as Error).message,
      });
    } finally {
      setStarting(false);
    }
  };

  const handleDownload = async (backup: Backup) => {
    setDownloadingId(backup.id);
    try {
      const blob = await backupsApi.download(activeTargetId, backup.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-${backup.startedAt.slice(0, 10)}-${backup.id.slice(0, 8)}.dump`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({
        type: "error",
        title: t("backups.downloadFailed"),
        message: (err as Error).message,
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (backup: Backup) => {
    if (!confirm(t("backups.deleteConfirm"))) return;
    try {
      await backupsApi.remove(activeTargetId, backup.id);
      toast({ type: "success", title: t("backups.deleted") });
      refetch();
    } catch (err) {
      toast({
        type: "error",
        title: t("backups.deleteFailed"),
        message: (err as Error).message,
      });
    }
  };

  const totalSize = (data ?? [])
    .filter((b) => b.status === "completed" && b.fileSizeBytes)
    .reduce((sum, b) => sum + Number(b.fileSizeBytes), 0);

  return (
    <>
      <TopBar
        title={t("nav.backups")}
        subtitle={t("backups.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              icon={<RefreshCw size={13} />}
              onClick={refetch}
              loading={loading}
            >
              {t("common.refresh")}
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<Play size={13} />}
              onClick={handleStart}
              loading={starting}
              disabled={hasRunning}
            >
              {t("backups.start")}
            </Button>
          </div>
        }
      />
      <PageContent>
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <TargetSelector />
          {hasRunning && (
            <Badge variant="info" size="sm" dot>
              {t("backups.running")}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
          <Card padding="sm">
            <div className="text-[10px] text-muted uppercase tracking-wide mb-1">
              {t("backups.total")}
            </div>
            <div className="text-2xl font-bold tabular-nums text-primary">
              {data?.length ?? "—"}
            </div>
          </Card>
          <Card padding="sm">
            <div className="text-[10px] text-muted uppercase tracking-wide mb-1">
              {t("backups.successful")}
            </div>
            <div className="text-2xl font-bold tabular-nums text-green-400">
              {(data ?? []).filter((b) => b.status === "completed").length}
            </div>
          </Card>
          <Card padding="sm">
            <div className="text-[10px] text-muted uppercase tracking-wide mb-1">
              {t("backups.totalSize")}
            </div>
            <div className="text-2xl font-bold tabular-nums text-primary">
              {fmtBytes(totalSize)}
            </div>
          </Card>
        </div>

        {totalSize > 10 * 1024 * 1024 * 1024 && (
          <Card className="mb-5 border-yellow-300 dark:border-yellow-500/40">
            <div className="flex items-start gap-3">
              <AlertTriangle
                size={16}
                className="text-yellow-400 mt-0.5 shrink-0"
              />
              <div>
                <p className="text-sm font-medium text-primary">
                  {t("backups.diskWarningTitle")}
                </p>
                <p className="text-xs text-secondary mt-1">
                  {t("backups.diskWarningMessage")}
                </p>
              </div>
            </div>
          </Card>
        )}

        <Card>
          <CardHeader
            title={t("backups.history")}
            icon={<HardDriveDownload size={15} />}
          />
          <DataTable<Backup>
            loading={loading && !data}
            data={data ?? []}
            keyFn={(b) => b.id}
            emptyMsg={t("backups.empty")}
            emptyIcon={<HardDriveDownload size={32} />}
            columns={[
              {
                key: "status",
                header: t("backups.colStatus"),
                width: "110px",
                render: (b) => <StatusBadge status={b.status} />,
              },
              {
                key: "started",
                header: t("backups.colStarted"),
                width: "120px",
                render: (b) => (
                  <span className="text-xs text-secondary">
                    {fmtRelative(b.startedAt, locale)}
                  </span>
                ),
              },
              {
                key: "duration",
                header: t("backups.colDuration"),
                width: "100px",
                align: "right",
                render: (b) => (
                  <span className="text-xs mono text-secondary">
                    {duration(b.startedAt, b.completedAt)}
                  </span>
                ),
              },
              {
                key: "size",
                header: t("backups.colSize"),
                width: "90px",
                align: "right",
                render: (b) => (
                  <span className="text-xs mono text-primary font-medium">
                    {b.fileSizeBytes ? fmtBytes(Number(b.fileSizeBytes)) : "—"}
                  </span>
                ),
              },
              {
                key: "error",
                header: t("backups.colError"),
                render: (b) =>
                  b.errorMessage ? (
                    <span
                      className="text-xs text-red-400 mono truncate block max-w-[280px]"
                      title={b.errorMessage}
                    >
                      {b.errorMessage}
                    </span>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  ),
              },
              {
                key: "actions",
                header: "",
                width: "90px",
                align: "right",
                render: (b) => (
                  <div className="flex items-center justify-end gap-1">
                    {b.status === "completed" && (
                      <Button
                        size="xs"
                        variant="ghost"
                        icon={<Download size={12} />}
                        onClick={() => handleDownload(b)}
                        loading={downloadingId === b.id}
                      />
                    )}
                    {b.status !== "running" && (
                      <Button
                        size="xs"
                        variant="danger"
                        icon={<Trash2 size={12} />}
                        onClick={() => handleDelete(b)}
                      />
                    )}
                  </div>
                ),
              },
            ]}
          />
        </Card>
      </PageContent>
    </>
  );
}
