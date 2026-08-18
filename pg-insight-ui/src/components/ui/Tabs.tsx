import React, { createContext, useContext, useState } from "react";
import { cn } from "@/lib/format";

const TabsCtx = createContext<{
  active: string;
  setActive: (v: string) => void;
} | null>(null);

export function Tabs({
  children,
  defaultValue,
  className,
}: {
  children: React.ReactNode;
  defaultValue: string;
  className?: string;
}) {
  const [active, setActive] = useState(defaultValue);
  return (
    <TabsCtx.Provider value={{ active, setActive }}>
      <div className={className}>{children}</div>
    </TabsCtx.Provider>
  );
}

export function TabList({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-1 border-b border-[var(--border)] mb-4">
      {children}
    </div>
  );
}

export function Tab({
  value,
  children,
  icon,
}: {
  value: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const ctx = useContext(TabsCtx)!;
  const active = ctx.active === value;
  return (
    <button
      onClick={() => ctx.setActive(value)}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors",
        active
          ? "text-brand-500 border-brand-500"
          : "text-muted border-transparent hover:text-secondary hover:border-[var(--border-strong)]",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function TabPanel({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  const ctx = useContext(TabsCtx)!;
  if (ctx.active !== value) return null;
  return <div className="animate-fade-in">{children}</div>;
}
