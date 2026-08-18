import React from "react";
import { Skeleton } from "./Skeleton";

interface StatBoxProps {
  label: string;
  value: string | number | React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  loading?: boolean;
  className?: string;
}

export function StatBox({
  label,
  value,
  sub,
  icon,
  loading,
  className,
}: StatBoxProps) {
  return (
    <div className={className}>
      <div className="flex items-center gap-1.5 mb-2">
        {icon && (
          <span className="text-slate-400 dark:text-slate-500">{icon}</span>
        )}
        <span className="text-xs font-medium text-muted uppercase tracking-wide">
          {label}
        </span>
      </div>
      {loading ? (
        <Skeleton className="h-8 w-24 rounded" />
      ) : (
        <div className="text-2xl font-bold text-primary tabular-nums leading-none">
          {value}
        </div>
      )}
      {sub && <div className="text-xs text-muted mt-1.5">{sub}</div>}
    </div>
  );
}
