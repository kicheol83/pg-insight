import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { TargetHealthGate } from "@/components/layout/TargetHealthGate";
import { AppProvider } from "@/store/app";
import { ThemeProvider } from "@/store/theme";
import { AuthProvider, useAuth } from "@/store/auth";
import { I18nProvider } from "@/i18n";
import { ToastProvider, Spinner } from "@/components/ui";
import BackupsPage from "./pages/backup/BackupsPage";

const DashboardPage = lazy(() => import("./pages/dashboard/DashboardPage"));
const TargetsPage = lazy(() => import("./pages/targets/TargetsPage"));
const ConnectionsPage = lazy(
  () => import("./pages/connections/ConnectionsPage"),
);
const QueriesPage = lazy(() => import("./pages/queries/QueriesPage"));
const LocksPage = lazy(() => import("./pages/locks/LocksPage"));
const TablesPage = lazy(() => import("./pages/tables/TablesPage"));
const VacuumPage = lazy(() => import("./pages/vacuum/VacuumPage"));
const ReplicationPage = lazy(
  () => import("./pages/replication/ReplicationPage"),
);
const AlertsPage = lazy(() => import("./pages/alerts/AlertsPage"));
const SettingsPage = lazy(() => import("./pages/settings/SettingsPage"));
const DiagnosticsPage = lazy(
  () => import("./pages/diagnostics/DiagnosticsPage"),
);
const DatabasePage = lazy(() => import("./pages/database/DatabasePage"));
const IoMonitoringPage = lazy(() => import("./pages/io/IoMonitoringPage"));
const JobProgressPage = lazy(
  () => import("./pages/job-progress/JobProgressPage"),
);
const LoginPage = lazy(() => import("./pages/auth/LoginPage"));

function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center h-screen">
      <Spinner size="lg" />
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <AppProvider>
              <BrowserRouter>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route
                      path="/*"
                      element={
                        <RequireAuth>
                          <AppLayout>
                            <TargetHealthGate>
                              <Suspense fallback={<PageLoader />}>
                                <Routes>
                                  <Route path="/" element={<DashboardPage />} />
                                  <Route
                                    path="/targets"
                                    element={<TargetsPage />}
                                  />
                                  <Route
                                    path="/backups"
                                    element={<BackupsPage />}
                                  />
                                  <Route
                                    path="/database"
                                    element={<DatabasePage />}
                                  />
                                  <Route
                                    path="/connections"
                                    element={<ConnectionsPage />}
                                  />
                                  <Route
                                    path="/queries"
                                    element={<QueriesPage />}
                                  />
                                  <Route
                                    path="/locks"
                                    element={<LocksPage />}
                                  />
                                  <Route
                                    path="/tables"
                                    element={<TablesPage />}
                                  />
                                  <Route
                                    path="/io"
                                    element={<IoMonitoringPage />}
                                  />
                                  <Route
                                    path="/vacuum"
                                    element={<VacuumPage />}
                                  />
                                  <Route
                                    path="/job-progress"
                                    element={<JobProgressPage />}
                                  />
                                  <Route
                                    path="/replication"
                                    element={<ReplicationPage />}
                                  />
                                  <Route
                                    path="/alerts"
                                    element={<AlertsPage />}
                                  />
                                  <Route
                                    path="/settings"
                                    element={<SettingsPage />}
                                  />
                                  <Route
                                    path="/diagnostics"
                                    element={<DiagnosticsPage />}
                                  />
                                  <Route
                                    path="*"
                                    element={<Navigate to="/" replace />}
                                  />
                                </Routes>
                              </Suspense>
                            </TargetHealthGate>
                          </AppLayout>
                        </RequireAuth>
                      }
                    />
                  </Routes>
                </Suspense>
              </BrowserRouter>
            </AppProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
