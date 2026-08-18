import { Server } from "lucide-react";
import { Badge } from "@/components/ui";
import { fmtBytes, fmtMs, cn } from "@/lib/format";
import { lagColor } from "@/lib/colors";
import type { ReplicaInfo } from "@/types/model";

export function ReplicaCard({ replica }: { replica: ReplicaInfo }) {
  return (
    <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-teal-500/10 rounded-lg">
            <Server size={14} className="text-teal-400" />
          </div>
          <div>
            <div className="text-xs font-semibold text-primary">
              {replica.applicationName || `PID ${replica.pid}`}
            </div>
            <div className="text-[10px] text-muted mono">
              {replica.clientAddr}
            </div>
          </div>
        </div>
        <div className="flex gap-1.5">
          <Badge
            variant={replica.state === "streaming" ? "success" : "warning"}
            size="xs"
            dot
          >
            {replica.state}
          </Badge>
          <Badge
            variant={replica.syncState === "sync" ? "info" : "default"}
            size="xs"
          >
            {replica.syncState}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-2">
        {[
          {
            label: "Write lag",
            bytes: replica.writeLagBytes,
            ms: replica.writeLagMs,
          },
          {
            label: "Flush lag",
            bytes: replica.flushLagBytes,
            ms: replica.flushLagMs,
          },
          {
            label: "Replay lag",
            bytes: replica.replayLagBytes,
            ms: replica.replayLagMs,
          },
        ].map((l) => (
          <div
            key={l.label}
            className="p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]"
          >
            <div className="text-[10px] text-muted mb-0.5">{l.label}</div>
            <div className={cn("text-xs font-bold", lagColor(l.bytes))}>
              {fmtBytes(l.bytes)}
            </div>
            {l.ms !== null && (
              <div className="text-[10px] text-muted">{fmtMs(l.ms)}</div>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-between text-[10px] text-muted">
        <span>
          Total lag:{" "}
          <span className={cn("font-bold", lagColor(replica.totalLagBytes))}>
            {fmtBytes(replica.totalLagBytes)}
          </span>
        </span>
        {replica.replyTime && (
          <span>
            Last reply: {new Date(replica.replyTime).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}
