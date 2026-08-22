import { useLocation, Navigate } from "react-router-dom";
import { useQuery } from "@/hooks/useQuery";
import { useActiveTarget } from "@/store/app";
import { targetsApi } from "@/api/endpoints";

const EXEMPT_PATHS = ["/diagnostics", "/targets"];

export function TargetHealthGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { activeTargetId } = useActiveTarget();

  const { data: targets } = useQuery(() => targetsApi.list(), {
    refreshInterval: 30_000,
    enabled: !!activeTargetId,
  });

  const isExempt = EXEMPT_PATHS.some((p) => location.pathname.startsWith(p));
  const activeTarget = targets?.find((t) => t.id === activeTargetId);

  if (!isExempt && activeTarget?.status === "error") {
    return <Navigate to="/diagnostics" replace />;
  }

  return <>{children}</>;
}
