// ══════════════════════════════════════════════════════════════
// src/pages/diagnostics/DiagnosticsPage.tsx
//
// PG Insight open source — har kimning PostgreSQL muhiti boshqacha
// (versiya, ruxsatlar, extension'lar). Shu sabab target ulanganda
// yoki muammoga uchraganda foydalanuvchi buzilgan sahifalar bilan
// qolib ketmasin deb, shu sahifaga yo'naltiriladi: har bir muammo
// oddiy tilda tushuntiriladi va aniq tuzatish buyrug'i (nusxalash
// tugmasi bilan) ko'rsatiladi. Muammolar hal bo'lgach — "Davom
// etish" tugmasi orqali asosiy sahifalarga o'tish mumkin.
// ══════════════════════════════════════════════════════════════

import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  Stethoscope,
  Database,
  Gauge,
  Info,
  HelpCircle,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/layout/AppLayout";
import {
  Card,
  CardHeader,
  Badge,
  Button,
  CopyButton,
  EmptyState,
  LoadingState,
  TargetSelector,
} from "@/components/ui";
import { useQuery } from "@/hooks/useQuery";
import { useActiveTarget } from "@/store/app";
import { liveApi } from "@/api/endpoints";
import { cn } from "@/lib/format";
import type {
  DiagnosticCheck,
  HealthFactor,
  HealthScoreReport,
} from "@/types/model";

function StatusIcon({ status }: { status: DiagnosticCheck["status"] }) {
  if (status === "ok")
    return <CheckCircle2 size={18} className="text-green-400 shrink-0" />;
  if (status === "warning")
    return <AlertTriangle size={18} className="text-yellow-400 shrink-0" />;
  return <XCircle size={18} className="text-red-400 shrink-0" />;
}

function CheckRow({ check }: { check: DiagnosticCheck }) {
  const isProblem = check.status !== "ok";
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        check.status === "error"
          ? "border-red-300 dark:border-red-500/40 bg-red-50/50 dark:bg-red-500/5"
          : check.status === "warning"
            ? "border-yellow-300 dark:border-yellow-500/40 bg-yellow-50/50 dark:bg-yellow-500/5"
            : "border-[var(--border)]",
      )}
    >
      <div className="flex items-start gap-3">
        <StatusIcon status={check.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-primary">
              {check.title}
            </h3>
            <Badge variant="default" size="xs">
              {check.affects}
            </Badge>
          </div>

          {isProblem ? (
            <>
              <p className="text-sm text-secondary mt-1.5">{check.message}</p>
              {check.detail && (
                <p className="text-xs text-muted mt-1 mono">{check.detail}</p>
              )}
              {check.fixTitle && (
                <div className="mt-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] p-3">
                  <p className="text-xs font-medium text-primary mb-2">
                    {check.status === "error"
                      ? "✕ Bu muammoni qanday tuzatish mumkin:"
                      : "⚠ Tavsiya:"}{" "}
                    {check.fixTitle}
                  </p>
                  {check.fixCommand && (
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs mono text-brand-500 bg-brand-500/10 rounded px-2.5 py-1.5 overflow-x-auto whitespace-nowrap">
                        {check.fixCommand}
                      </code>
                      <CopyButton text={check.fixCommand} />
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted mt-1">Muammo topilmadi</p>
          )}
        </div>
      </div>
    </div>
  );
}

function HealthFactorStatusIcon({
  status,
}: {
  status: HealthFactor["status"];
}) {
  if (status === "ok")
    return <CheckCircle2 size={14} className="text-green-400 shrink-0" />;
  if (status === "warning")
    return <AlertTriangle size={14} className="text-yellow-400 shrink-0" />;
  if (status === "info")
    return <Info size={14} className="text-blue-400 shrink-0" />;
  return <XCircle size={14} className="text-red-400 shrink-0" />;
}

function HealthFactorRow({ factor }: { factor: HealthFactor }) {
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-[var(--border)] last:border-0">
      <HealthFactorStatusIcon status={factor.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-primary">
            {factor.label}
          </span>
          {factor.impact < 0 && (
            <span className="text-xs mono text-red-400 font-medium shrink-0">
              {factor.impact}
            </span>
          )}
        </div>
        {factor.detail && (
          <p className="text-[11px] text-muted mt-0.5">{factor.detail}</p>
        )}
      </div>
    </div>
  );
}

const GRADE_LABEL: Record<HealthScoreReport["grade"], string> = {
  excellent: "A'lo",
  good: "Yaxshi",
  fair: "O'rtacha",
  poor: "Yomon",
};
const GRADE_COLOR: Record<HealthScoreReport["grade"], string> = {
  excellent: "text-green-400",
  good: "text-blue-400",
  fair: "text-yellow-400",
  poor: "text-red-400",
};
const GRADE_RING: Record<HealthScoreReport["grade"], string> = {
  excellent: "border-green-400",
  good: "border-blue-400",
  fair: "border-yellow-400",
  poor: "border-red-400",
};

function HealthScoreCard({
  data,
  loading,
  onRefresh,
}: {
  data: HealthScoreReport | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <Card className="mb-5">
      <CardHeader
        title="Health Score"
        subtitle="Database operatsion holati — bloat, XID, cache, replication, backup"
        icon={<Gauge size={15} />}
        action={
          <Button
            size="xs"
            variant="ghost"
            icon={<RefreshCw size={12} />}
            onClick={onRefresh}
            loading={loading}
          >
            Yangilash
          </Button>
        }
      />
      {loading && !data ? (
        <LoadingState message="Hisoblanmoqda…" />
      ) : !data ? (
        <EmptyState icon={<HelpCircle size={24} />} title="Ma'lumot yo'q" />
      ) : (
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="flex items-center gap-4 shrink-0">
            <div
              className={cn(
                "w-20 h-20 rounded-full border-4 flex flex-col items-center justify-center shrink-0",
                GRADE_RING[data.grade],
              )}
            >
              <span
                className={cn(
                  "text-2xl font-bold tabular-nums leading-none",
                  GRADE_COLOR[data.grade],
                )}
              >
                {data.score}
              </span>
              <span className="text-[9px] text-muted mt-0.5">/ 100</span>
            </div>
            <div>
              <div
                className={cn("text-sm font-semibold", GRADE_COLOR[data.grade])}
              >
                {GRADE_LABEL[data.grade]}
              </div>
              <div className="text-[11px] text-muted mt-0.5">
                {data.factors.filter((f) => f.status !== "ok").length} ta omil
                ballga ta'sir qilmoqda
              </div>
            </div>
          </div>
          <div className="flex-1 min-w-0 sm:border-l sm:border-[var(--border)] sm:pl-6">
            {data.factors.map((f) => (
              <HealthFactorRow key={f.id} factor={f} />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function DiagnosticsPage() {
  const { activeTargetId } = useActiveTarget();
  const navigate = useNavigate();

  const { data, loading, refetch, updatedAt } = useQuery(
    () => liveApi.diagnostics(activeTargetId ?? ""),
    { enabled: !!activeTargetId },
  );
  const {
    data: healthData,
    loading: healthLoading,
    refetch: refetchHealth,
  } = useQuery(() => liveApi.healthScore(activeTargetId ?? ""), {
    enabled: !!activeTargetId,
  });

  if (!activeTargetId) {
    return (
      <>
        <TopBar
          title="Diagnostika"
          subtitle="Target ulanish holatini tekshirish"
        />
        <PageContent>
          <div className="flex items-center gap-3 mb-5">
            <TargetSelector />
          </div>
          <EmptyState
            icon={<Database size={32} />}
            title="Target tanlanmagan"
            message="Diagnostika o'tkazish uchun avval PostgreSQL target qo'shing yoki tanlang."
          />
        </PageContent>
      </>
    );
  }

  const errorCount =
    data?.checks.filter((c) => c.status === "error").length ?? 0;
  const warningCount =
    data?.checks.filter((c) => c.status === "warning").length ?? 0;
  const canProceed = data && data.overallStatus !== "broken";

  return (
    <>
      <TopBar
        title="Diagnostika"
        subtitle={
          updatedAt ? `Tekshirildi: hozirgina` : "Target holatini tekshirish"
        }
        actions={
          <Button
            size="sm"
            variant="ghost"
            icon={<RefreshCw size={13} />}
            onClick={refetch}
            loading={loading}
          >
            Qayta tekshirish
          </Button>
        }
      />
      <PageContent>
        <div className="flex items-center gap-3 mb-5">
          <TargetSelector />
        </div>

        <HealthScoreCard
          data={healthData ?? null}
          loading={healthLoading}
          onRefresh={refetchHealth}
        />

        {loading && !data ? (
          <Card>
            <LoadingState message="Target tekshirilmoqda…" />
          </Card>
        ) : !data ? (
          <Card>
            <EmptyState title="Tekshiruv natijasi yo'q" />
          </Card>
        ) : (
          <>
            <Card
              className={cn(
                "mb-5",
                data.overallStatus === "healthy"
                  ? "border-green-300 dark:border-green-500/40"
                  : data.overallStatus === "degraded"
                    ? "border-yellow-300 dark:border-yellow-500/40"
                    : "border-red-300 dark:border-red-500/40",
              )}
            >
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                    data.overallStatus === "healthy"
                      ? "bg-green-500/10"
                      : data.overallStatus === "degraded"
                        ? "bg-yellow-500/10"
                        : "bg-red-500/10",
                  )}
                >
                  <Stethoscope
                    size={22}
                    className={
                      data.overallStatus === "healthy"
                        ? "text-green-400"
                        : data.overallStatus === "degraded"
                          ? "text-yellow-400"
                          : "text-red-400"
                    }
                  />
                </div>
                <div className="flex-1">
                  <h2 className="text-base font-semibold text-primary">
                    {data.overallStatus === "healthy" &&
                      "Hammasi joyida — target to'liq ishlaydi"}
                    {data.overallStatus === "degraded" &&
                      "Ishlayapti, lekin ba'zi sahifalar cheklangan"}
                    {data.overallStatus === "broken" &&
                      "Ulanishda jiddiy muammo bor"}
                  </h2>
                  <p className="text-xs text-muted mt-1">
                    {data.pgVersion && `PostgreSQL ${data.pgVersion} · `}
                    {errorCount > 0 && (
                      <span className="text-red-400 font-medium">
                        {errorCount} ta xato
                      </span>
                    )}
                    {errorCount > 0 && warningCount > 0 && " · "}
                    {warningCount > 0 && (
                      <span className="text-yellow-400 font-medium">
                        {warningCount} ta ogohlantirish
                      </span>
                    )}
                    {errorCount === 0 &&
                      warningCount === 0 &&
                      "Barcha tekshiruvlar muvaffaqiyatli"}
                  </p>
                </div>
                {canProceed && (
                  <Button
                    variant="primary"
                    icon={<ArrowRight size={14} />}
                    onClick={() => navigate("/")}
                  >
                    Dashboard'ga o'tish
                  </Button>
                )}
              </div>
            </Card>

            <div className="space-y-3">
              {data.checks.map((check) => (
                <CheckRow key={check.id} check={check} />
              ))}
            </div>

            {!canProceed && (
              <p className="text-xs text-muted text-center mt-5">
                Yuqoridagi xatolarni tuzatgach, "Qayta tekshirish" tugmasini
                bosing — muammo yo'qolgach, davom etish tugmasi paydo bo'ladi.
              </p>
            )}
          </>
        )}
      </PageContent>
    </>
  );
}
