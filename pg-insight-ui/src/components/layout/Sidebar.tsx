import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Database,
  Zap,
  Lock,
  Wifi,
  Activity,
  Trash2,
  GitBranch,
  Bell,
  Settings,
  Stethoscope,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/format";
import { useAppStore } from "@/store/app";
import { LiveDot, Badge } from "@/components/ui";

const NAV_ITEMS = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", exact: true },
  { to: "/targets", icon: Database, label: "Targets" },
  { to: "/connections", icon: Wifi, label: "Connections" },
  { to: "/queries", icon: Zap, label: "Queries" },
  { to: "/locks", icon: Lock, label: "Locks" },
  { to: "/tables", icon: Activity, label: "Tables & Indexes" },
  { to: "/vacuum", icon: Trash2, label: "Vacuum" },
  { to: "/replication", icon: GitBranch, label: "Replication" },
  { to: "/alerts", icon: Bell, label: "Alerts" },
  { to: "/settings", icon: Settings, label: "Settings" },
  { to: "/diagnostics", icon: Stethoscope, label: "Diagnostics" },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { state } = useAppStore();
  const location = useLocation();

  return (
    <aside
      className={cn(
        "flex flex-col h-screen sticky top-0 z-30 shrink-0",
        "bg-[var(--bg-card)] border-r border-[var(--border)]",
        "transition-all duration-200",
        collapsed ? "w-[60px]" : "w-[240px]",
      )}
    >
      <div
        className={cn(
          "flex items-center h-14 px-4 border-b border-[var(--border)]",
          collapsed && "justify-center px-0",
        )}
      >
        <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold">PG</span>
        </div>
        {!collapsed && (
          <div className="ml-2.5">
            <div className="text-sm font-bold text-primary leading-none">
              PG Insight
            </div>
            <div className="text-[10px] text-muted leading-none mt-0.5">
              PostgreSQL Monitor
            </div>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center gap-2">
          <LiveDot active={state.wsStatus === "connected"} size="xs" />
          <span className="text-[11px] text-muted">
            {state.wsStatus === "connected" ? "Live" : "Connecting…"}
          </span>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_ITEMS.map((item) => {
          const active = item.exact
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-lg transition-colors mb-0.5",
                collapsed
                  ? "w-9 h-9 mx-auto justify-center"
                  : "gap-2.5 px-3 h-9 mx-2",
                active
                  ? "bg-brand-500/15 text-brand-500"
                  : "text-secondary hover:bg-[var(--bg-hover)] hover:text-primary",
              )}
            >
              <item.icon size={16} className="shrink-0" />
              {!collapsed && (
                <span className="text-sm font-medium truncate">
                  {item.label}
                </span>
              )}
              {!collapsed &&
                item.label === "Alerts" &&
                state.activeAlertsCount > 0 && (
                  <Badge variant="error" size="xs" className="ml-auto">
                    {state.activeAlertsCount}
                  </Badge>
                )}
            </NavLink>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div
        className={cn(
          "p-3 border-t border-[var(--border)] flex",
          collapsed ? "justify-center" : "justify-end",
        )}
      >
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-[var(--bg-hover)] transition-colors"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>
    </aside>
  );
}
