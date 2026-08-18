import { useState, useRef, useEffect } from "react";
import {
  ChevronDown,
  Database,
  Plus,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/format";
import { useQuery } from "@/hooks/useQuery";
import { useActiveTarget } from "@/store/app";
import { targetsApi } from "@/api/endpoints";
import type { Target } from "@/types/model";

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "active":
      return <CheckCircle2 size={12} className="text-green-400" />;
    case "error":
      return <XCircle size={12} className="text-red-400" />;
    case "connecting":
      return <Loader2 size={12} className="text-blue-400 animate-spin-c" />;
    default:
      return <Database size={12} className="text-slate-400" />;
  }
}

export function TargetSelector() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { activeTargetId, setActiveTarget } = useActiveTarget();

  const { data } = useQuery<Target[]>(() => targetsApi.list(), {
    refreshInterval: 30_000,
  });
  const targets = data ?? [];
  const active = targets.find((t) => t.id === activeTargetId);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!activeTargetId && targets.length > 0) {
      const first = targets.find((t) => t.status === "active") ?? targets[0];
      if (first) setActiveTarget(first.id);
    }
  }, [targets, activeTargetId, setActiveTarget]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all text-sm",
          "border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-strong)]",
          "min-w-[220px] max-w-[300px]",
          open && "border-brand-500 ring-2 ring-brand-500/20",
        )}
      >
        <Database size={14} className="text-brand-500 shrink-0" />
        <div className="flex-1 min-w-0 text-left">
          {active ? (
            <>
              <div className="text-xs font-medium text-primary truncate">
                {active.name}
              </div>
              <div className="text-[10px] text-muted truncate">
                {active.host}:{active.port}/{active.database}
              </div>
            </>
          ) : (
            <span className="text-xs text-muted">Select a target…</span>
          )}
        </div>
        <ChevronDown
          size={13}
          className={cn(
            "text-muted shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 card shadow-lg min-w-[280px] animate-fade-in overflow-hidden">
          {targets.length === 0 ? (
            <div className="p-4 text-center">
              <Database
                size={24}
                className="text-slate-300 dark:text-slate-600 mx-auto mb-2"
              />
              <p className="text-xs text-muted">No targets added yet</p>
            </div>
          ) : (
            <div className="py-1 max-h-80 overflow-y-auto">
              {targets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTarget(t.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                    t.id === activeTargetId
                      ? "bg-brand-500/10 text-brand-500"
                      : "hover:bg-[var(--bg-hover)] text-primary",
                  )}
                >
                  <StatusIcon status={t.status} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{t.name}</div>
                    <div className="text-[10px] text-muted truncate">
                      {t.host}:{t.port}/{t.database}
                      {t.pgVersion && (
                        <span className="ml-1">· PG {t.pgVersion}</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="border-t border-[var(--border)] p-1">
            <button
              onClick={() => {
                setOpen(false);
                navigate("/targets");
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-brand-500 hover:bg-brand-500/10 rounded-md transition-colors"
            >
              <Plus size={13} />
              Add PostgreSQL target
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
