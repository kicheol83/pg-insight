import React from "react";
import { cn } from "@/lib/format";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
  hover?: boolean;
  onClick?: () => void;
}

export function Card({
  children,
  className,
  padding = "md",
  hover,
  onClick,
}: CardProps) {
  const pads = { none: "", sm: "p-3", md: "p-5", lg: "p-6" };
  return (
    <div
      className={cn(
        "card",
        pads[padding],
        hover && "card-hover cursor-pointer",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between mb-4", className)}>
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && (
          <div className="text-slate-400 dark:text-slate-500 shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-primary truncate">
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs text-muted mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {action && (
        <div className="flex items-center gap-2 shrink-0 ml-3">{action}</div>
      )}
    </div>
  );
}
