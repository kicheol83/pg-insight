import type { ReactNode } from "react";
import { Archive, ShieldCheck, Activity } from "lucide-react";
import { Card, CardHeader, Badge } from "@/components/ui";
import { fmtBytes, fmtMs, fmtNum, fmtRelative } from "@/lib/format";
import { useI18n } from "@/i18n";
import type { ReplicationSnapshot } from "@/types/model";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-[var(--border)] last:border-0 text-xs">
      <span className="text-muted shrink-0">{label}</span>
      <span className="text-primary text-right min-w-0 truncate">
        {children}
      </span>
    </div>
  );
}

function SyncCard({ data }: { data: ReplicationSnapshot }) {
  const { t } = useI18n();
  const sync = data.synchronous;
  return (
    <Card>
      <CardHeader
        title={t("replication.syncTitle")}
        subtitle={t("replication.syncSubtitle")}
        icon={<ShieldCheck size={15} />}
        action={
          sync ? (
            <Badge variant={sync.satisfied ? "success" : "error"} size="sm" dot>
              {sync.satisfied
                ? t("replication.syncSatisfied")
                : t("replication.syncBlocked")}
            </Badge>
          ) : (
            <Badge variant="default" size="sm">
              {t("replication.syncAsync")}
            </Badge>
          )
        }
      />
      {sync ? (
        <>
          <Row label="synchronous_standby_names">
            <span className="mono">{sync.standbyNames}</span>
          </Row>
          <Row label={t("replication.syncHealthy")}>
            <span
              className={
                sync.satisfied
                  ? "text-green-400 font-bold"
                  : "text-red-400 font-bold"
              }
            >
              {sync.healthy} / {sync.required}
            </span>
          </Row>
          {!sync.satisfied && (
            <p className="text-[11px] text-red-400 mt-2">
              {t("replication.syncBlockedHint")}
            </p>
          )}
        </>
      ) : (
        <p className="text-xs text-muted">{t("replication.syncAsyncHint")}</p>
      )}
    </Card>
  );
}

function StandbyCard({ data }: { data: ReplicationSnapshot }) {
  const { t, locale } = useI18n();
  const standby = data.standby;
  const receiver = data.receiverInfo;
  return (
    <Card>
      <CardHeader
        title={t("replication.standbyTitle")}
        subtitle={t("replication.standbySubtitle")}
        icon={<Activity size={15} />}
        action={
          <Badge
            variant={
              receiver?.status === "streaming" && !standby?.paused
                ? "success"
                : "warning"
            }
            size="sm"
            dot
          >
            {standby?.paused
              ? t("replication.replayPaused")
              : (receiver?.status ?? t("replication.receiverMissing"))}
          </Badge>
        }
      />
      <Row label={t("replication.upstream")}>
        <span className="mono">
          {receiver?.senderHost
            ? `${receiver.senderHost}:${receiver.senderPort ?? ""}`
            : "—"}
        </span>
      </Row>
      <Row label={t("replication.receiveLsn")}>
        <span className="mono">{standby?.receiveLsn ?? "—"}</span>
      </Row>
      <Row label={t("replication.replayLsn")}>
        <span className="mono">{standby?.replayLsn ?? "—"}</span>
      </Row>
      <Row label={t("replication.replayGap")}>
        {standby ? fmtBytes(standby.replayGapBytes) : "—"}
      </Row>
      <Row label={t("replication.lastReplayedTx")}>
        {standby?.lastReplayAt
          ? `${fmtRelative(standby.lastReplayAt, locale)}${
              standby.replayDelaySec !== null
                ? ` (${fmtMs(standby.replayDelaySec * 1000)})`
                : ""
            }`
          : "—"}
      </Row>
    </Card>
  );
}

function ArchiverCard({ data }: { data: ReplicationSnapshot }) {
  const { t, locale } = useI18n();
  const a = data.archiver;
  if (!a) return null;
  const variant = !a.enabled ? "default" : a.failing ? "error" : "success";
  const label = !a.enabled
    ? !data.isPrimary && a.mode === "on"
      ? t("replication.archiveOnPrimary")
      : t("replication.archiveOff", { mode: a.mode })
    : a.failing
      ? t("replication.archiveFailing")
      : t("replication.archiveOk");
  return (
    <Card>
      <CardHeader
        title={t("replication.archiveTitle")}
        subtitle={t("replication.archiveSubtitle")}
        icon={<Archive size={15} />}
        action={
          <Badge variant={variant} size="sm" dot={a.enabled}>
            {label}
          </Badge>
        }
      />
      <Row label="archive_mode">
        <span className="mono">{a.mode}</span>
      </Row>
      <Row label={t("replication.archivedCount")}>
        {fmtNum(a.archivedCount)}
      </Row>
      <Row label={t("replication.lastArchived")}>
        <span className="mono">{a.lastArchivedWal ?? "—"}</span>
        {a.lastArchivedTime && (
          <span className="text-muted">
            {" · "}
            {fmtRelative(a.lastArchivedTime, locale)}
          </span>
        )}
      </Row>
      <Row label={t("replication.archiveFailed")}>
        <span className={a.failing ? "text-red-400 font-bold" : ""}>
          {fmtNum(a.failedCount)}
        </span>
        {a.lastFailedWal && (
          <span className="text-muted mono">
            {" · "}
            {a.lastFailedWal}
          </span>
        )}
      </Row>
      <Row label={t("replication.archiveReady")}>
        {!a.enabled ? (
          "—"
        ) : a.readyCount === null ? (
          <span className="text-muted">
            {t("replication.archiveReadyUnknown")}
          </span>
        ) : (
          <span
            className={a.readyCount > 20 ? "text-yellow-400 font-bold" : ""}
          >
            {fmtNum(a.readyCount)}
          </span>
        )}
      </Row>
    </Card>
  );
}

export function ReplicationHealthCards({
  data,
}: {
  data: ReplicationSnapshot;
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
      {data.isPrimary ? <SyncCard data={data} /> : <StandbyCard data={data} />}
      <ArchiverCard data={data} />
    </div>
  );
}
