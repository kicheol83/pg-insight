import { http } from "./http";
import type {
  Target,
  ConnectionTestResult,
  ConnectionSnapshot,
  QueryStat,
  ExplainResult,
  BlockingChain,
  LockSnapshot,
  TableSnapshot,
  VacuumSnapshot,
  ReplicationSnapshot,
  AlertRule,
  AlertEvent,
  PgSetting,
  SystemSnapshot,
  DashboardSummary,
  ConnectionTrendPoint,
  TimePoint,
  DiagnosticsReport,
  DatabaseStatsSnapshot,
  IoStatsSnapshot,
  JobProgressSnapshot,
  Backup,
} from "@/types/model";

export const targetsApi = {
  list: () => http.get<Target[]>("/targets").then((r) => r.data),
  get: (id: string) => http.get<Target>(`/targets/${id}`).then((r) => r.data),
  create: (d: unknown) => http.post<Target>("/targets", d).then((r) => r.data),
  update: (id: string, d: unknown) =>
    http.patch<Target>(`/targets/${id}`, d).then((r) => r.data),
  remove: (id: string) => http.delete(`/targets/${id}`).then((r) => r.data),
  test: (d: unknown) =>
    http.post<ConnectionTestResult>("/targets/test", d).then((r) => r.data),
  refresh: (id: string) =>
    http.post(`/targets/${id}/refresh`).then((r) => r.data),
  pause: (id: string) => http.post(`/targets/${id}/pause`).then((r) => r.data),
  resume: (id: string) =>
    http.post(`/targets/${id}/resume`).then((r) => r.data),
};

export const metricsApi = {
  dashboard: (tid: string) =>
    http.get<DashboardSummary>(`/metrics/${tid}/dashboard`).then((r) => r.data),
  connectionTrend: (tid: string, hours = 1, bucket = 1) =>
    http
      .get<
        ConnectionTrendPoint[]
      >(`/metrics/${tid}/connections/trend`, { params: { hours, bucket } })
      .then((r) => r.data),
  lockTrend: (tid: string, hours = 6) =>
    http
      .get(`/metrics/${tid}/locks/trend`, { params: { hours } })
      .then((r) => r.data),
  cacheHitTrend: (tid: string, hours = 24) =>
    http
      .get<TimePoint[]>(`/metrics/${tid}/cache-hit`, { params: { hours } })
      .then((r) => r.data),
  tableBloatTop: (tid: string) =>
    http.get(`/metrics/${tid}/table-bloat`).then((r) => r.data),
  replicationTrend: (tid: string, hours = 6) =>
    http
      .get<TimePoint[]>(`/metrics/${tid}/replication`, { params: { hours } })
      .then((r) => r.data),
  xidAgeTrend: (tid: string, hours = 24) =>
    http
      .get<TimePoint[]>(`/metrics/${tid}/xid-age`, { params: { hours } })
      .then((r) => r.data),
  connectionsByApp: (tid: string) =>
    http
      .get<
        Array<{ appName: string; count: number }>
      >(`/metrics/${tid}/connections-by-app`)
      .then((r) => r.data),
  queryVolume: (tid: string, hours = 6) =>
    http
      .get<TimePoint[]>(`/metrics/${tid}/query-volume`, { params: { hours } })
      .then((r) => r.data),
};

export const liveApi = {
  connections: (tid: string, minMs = 0) =>
    http
      .get<ConnectionSnapshot>(`/live/${tid}/connections`, {
        params: { minMs },
      })
      .then((r) => r.data),
  slowQueries: (tid: string, limit = 50) =>
    http
      .get<{
        queries: QueryStat[];
        count: number;
      }>(`/live/${tid}/queries/slow`, { params: { limit } })
      .then((r) => r.data),
  explain: (tid: string, sql: string) =>
    http
      .post<ExplainResult>(`/live/${tid}/queries/explain`, { sql })
      .then((r) => r.data),
  cancelQuery: (tid: string, pid: number) =>
    http.delete(`/live/${tid}/queries/${pid}/cancel`).then((r) => r.data),
  lockChains: (tid: string) =>
    http
      .get<{
        count: number;
        hasCritical: boolean;
        chains: BlockingChain[];
      }>(`/live/${tid}/locks/chains`)
      .then((r) => r.data),
  allLocks: (tid: string) =>
    http.get<LockSnapshot>(`/live/${tid}/locks`).then((r) => r.data),
  tableStats: (tid: string) =>
    http.get<TableSnapshot>(`/live/${tid}/tables`).then((r) => r.data),
  vacuumProgress: (tid: string) =>
    http
      .get<VacuumSnapshot>(`/live/${tid}/vacuum/progress`)
      .then((r) => r.data),
  replication: (tid: string) =>
    http
      .get<ReplicationSnapshot>(`/live/${tid}/replication`)
      .then((r) => r.data),
  systemInfo: (tid: string) =>
    http.get<SystemSnapshot>(`/live/${tid}/system`).then((r) => r.data),
  settings: (tid: string, search?: string) =>
    http
      .get<{
        settings: PgSetting[];
      }>(`/live/${tid}/system/settings`, { params: { search } })
      .then((r) => r.data),
  diagnostics: (tid: string) =>
    http.get<DiagnosticsReport>(`/live/${tid}/diagnostics`).then((r) => r.data),
  databaseStats: (tid: string) =>
    http
      .get<DatabaseStatsSnapshot>(`/live/${tid}/database`)
      .then((r) => r.data),
  ioStats: (tid: string) =>
    http.get<IoStatsSnapshot>(`/live/${tid}/io`).then((r) => r.data),
  jobProgress: (tid: string) =>
    http
      .get<JobProgressSnapshot>(`/live/${tid}/job-progress`)
      .then((r) => r.data),
};

export const alertsApi = {
  getRules: (tid: string) =>
    http.get<AlertRule[]>(`/alerts/${tid}/rules`).then((r) => r.data),
  createRule: (tid: string, d: unknown) =>
    http.post<AlertRule>(`/alerts/${tid}/rules`, d).then((r) => r.data),
  deleteRule: (id: string) =>
    http.delete(`/alerts/rules/${id}`).then((r) => r.data),
  getEvents: (tid: string, limit = 50) =>
    http
      .get<AlertEvent[]>(`/alerts/${tid}/events`, { params: { limit } })
      .then((r) => r.data),
  getActive: (tid: string) =>
    http.get<AlertEvent[]>(`/alerts/${tid}/events/active`).then((r) => r.data),
  acknowledge: (id: string) =>
    http.patch(`/alerts/events/${id}/ack`).then((r) => r.data),
};

export const backupsApi = {
  list: (tid: string) =>
    http.get<Backup[]>(`/targets/${tid}/backups`).then((r) => r.data),
  start: (tid: string) =>
    http.post<Backup>(`/targets/${tid}/backups`).then((r) => r.data),
  remove: (tid: string, backupId: string) =>
    http.delete(`/targets/${tid}/backups/${backupId}`).then((r) => r.data),
  download: (tid: string, backupId: string) =>
    http
      .get(`/targets/${tid}/backups/${backupId}/download`, {
        responseType: "blob",
      })
      .then((r) => r.data as Blob),
};
