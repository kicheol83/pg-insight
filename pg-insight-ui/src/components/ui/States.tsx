import React from "react";
import { AlertCircle } from "lucide-react";
import { Spinner } from "./Spinner";
import { Button } from "./Button";

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center px-6">
      {icon && (
        <div className="text-slate-300 dark:text-slate-600 mb-3">{icon}</div>
      )}
      <p className="text-sm font-medium text-secondary">{title}</p>
      {message && <p className="text-xs text-muted mt-1 max-w-xs">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingState({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-3">
      <Spinner size="md" />
      <span className="text-sm text-muted">{message ?? "Loading…"}</span>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-3">
      <AlertCircle size={28} className="text-red-400" />
      <p className="text-sm text-red-400 font-medium">Error</p>
      <p className="text-xs text-muted text-center max-w-xs">{message}</p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
