import React from "react";
import { cn } from "@/lib/format";
import { Spinner } from "./Spinner";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "xs" | "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

export function Button({
  children,
  variant = "secondary",
  size = "md",
  loading,
  icon,
  fullWidth,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const variants = {
    primary: "bg-brand-500 hover:bg-brand-600 text-white border-transparent",
    secondary:
      "bg-slate-100 dark:bg-slate-700/70 hover:bg-slate-200 dark:hover:bg-slate-600/70 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600",
    ghost:
      "bg-transparent hover:bg-slate-100 dark:hover:bg-slate-700/40 text-slate-600 dark:text-slate-400 border-transparent",
    danger:
      "bg-red-50 dark:bg-red-500/15 hover:bg-red-100 dark:hover:bg-red-500/25 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30",
    outline:
      "bg-transparent border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/40",
  };
  const sizes = {
    xs: "text-xs px-2 py-1 gap-1 h-6",
    sm: "text-xs px-2.5 py-1.5 gap-1.5 h-7",
    md: "text-sm px-3.5 py-2 gap-2 h-9",
    lg: "text-sm px-5 py-2.5 gap-2 h-11",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg border font-medium",
        "transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-brand-500/40",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner size="sm" /> : icon}
      {children}
    </button>
  );
}
