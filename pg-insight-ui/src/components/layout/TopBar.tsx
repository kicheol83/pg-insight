import React from "react";
import { Sun, Moon, Monitor, LogOut } from "lucide-react";
import { cn } from "@/lib/format";
import { useTheme } from "@/store/theme";
import { useAppStore } from "@/store/app";
import { useAuth } from "@/store/auth";
import { LiveDot } from "@/components/ui";
import { useI18n } from "@/i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";

interface TopBarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function TopBar({ title, subtitle, actions }: TopBarProps) {
  const { theme, setTheme } = useTheme();
  const { state } = useAppStore();
  const { logout } = useAuth();
  const { t } = useI18n();

  return (
    <header className="h-14 flex items-center justify-between px-5 border-b border-[var(--border)] bg-[var(--bg-card)] sticky top-0 z-20">
      <div>
        <h1 className="text-sm font-semibold text-primary">{title}</h1>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2">
        {actions}

        <LanguageSwitcher />

        <div className="flex items-center rounded-lg border border-[var(--border)] p-0.5 gap-0.5">
          {[
            { icon: Sun, value: "light" as const, tip: t("theme.light") },
            { icon: Moon, value: "dark" as const, tip: t("theme.dark") },
            { icon: Monitor, value: "system" as const, tip: t("theme.system") },
          ].map(({ icon: Icon, value, tip }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              title={tip}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                theme === value
                  ? "bg-[var(--bg-hover)] text-primary"
                  : "text-muted hover:text-primary",
              )}
            >
              <Icon size={13} />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)]">
          <LiveDot active={state.wsStatus === "connected"} size="xs" />
          <span className="text-xs text-muted hidden sm:block">
            {state.wsStatus === "connected"
              ? t("layout.live")
              : t("layout.offline")}
          </span>
        </div>

        <button
          onClick={logout}
          title={t("layout.logout")}
          aria-label={t("layout.logout")}
          className="p-2 rounded-lg text-muted hover:text-red-400 hover:bg-[var(--bg-hover)] transition-colors"
        >
          <LogOut size={14} />
        </button>
      </div>
    </header>
  );
}
