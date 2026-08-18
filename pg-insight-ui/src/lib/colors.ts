export const utilizationColor = (pct: number) => {
  if (pct >= 90) return "text-red-400";
  if (pct >= 75) return "text-yellow-500 dark:text-yellow-400";
  if (pct >= 50) return "text-blue-500 dark:text-blue-400";
  return "text-green-500 dark:text-green-400";
};

export const utilizationBarColor = (pct: number) => {
  if (pct >= 90) return "#ef4444";
  if (pct >= 75) return "#eab308";
  if (pct >= 50) return "#3b82f6";
  return "#22c55e";
};

export const xidAgeColor = (age: number) => {
  if (age >= 1_000_000_000) return "text-red-400";
  if (age >= 500_000_000) return "text-orange-400";
  if (age >= 200_000_000) return "text-yellow-400";
  return "text-green-400";
};

export const lagColor = (bytes: number) => {
  if (bytes >= 200 * 1024 * 1024) return "text-red-400";
  if (bytes >= 50 * 1024 * 1024) return "text-yellow-400";
  return "text-green-400";
};

export const severityBadge = (s: string) =>
  ({
    critical: "bg-red-500/15 text-red-400 border-red-500/30",
    high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    warning: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    info: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    low: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  })[s] ?? "bg-slate-500/15 text-slate-400 border-slate-500/30";

export const statusBadge = (s: string) =>
  ({
    active: "bg-green-500/15 text-green-400 border-green-500/30",
    connecting: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    error: "bg-red-500/15 text-red-400 border-red-500/30",
    paused: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  })[s] ?? "bg-slate-500/15 text-slate-400 border-slate-500/30";
