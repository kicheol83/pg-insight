export interface Target {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  status: "active" | "connecting" | "error" | "paused";
  pgVersion?: string;
  hasStatStatements: boolean;
  poolTotal: number;
  poolIdle: number;
  lastCollectedAt?: string;
  errorMessage?: string;
  isCollecting: boolean;
}

export interface ConnectionTestResult {
  success: boolean;
  pgVersion?: string;
  latencyMs?: number;
  errorMessage?: string;
}

export interface Session {
  pid: number;
  username: string;
  applicationName: string;
  clientAddr: string | null;
  dbName: string;
  state: string;
  waitEventType: string | null;
  waitEvent: string | null;
  queryDurationMs: number;
  xactDurationMs: number;
  query: string | null;
  backendType: string;
  isLongRunning: boolean;
  isIdleInTx: boolean;
  isWaitingForLock: boolean;
}

export interface ConnectionSnapshot {
  totalConnections: number;
  activeQueries: number;
  idleConnections: number;
  idleInTransaction: number;
  waitingForLock: number;
  maxConnections: number;
  connectionUsagePct: number;
  longestQueryMs: number;
  longestIdleInTxMs: number;
  sessions: Session[];
  byState: Array<{ state: string; count: number }>;
  byWaitEvent: Array<{
    waitEventType: string;
    waitEvent: string | null;
    count: number;
  }>;
  byApplication: Array<{ applicationName: string; count: number }>;
}

export interface QueryStat {
  queryId: string;
  queryText: string;
  calls: number;
  totalTimeMs: number;
  meanTimeMs: number;
  maxTimeMs: number;
  stddevTimeMs: number;
  rowsPerCall: number;
  cacheHitRatio: number;
  tags: string[];
  isSlow: boolean;
  isFrequent: boolean;
}

export interface ExplainResult {
  plan: unknown[];
  executionTimeMs: number;
  recommendations: string[];
}

export interface BlockingChain {
  blockerPid: number;
  blockerUsername: string;
  blockerApp: string;
  blockerQuery: string;
  blockerQueryMs: number;
  blockerState: string;
  waiters: Array<{
    waiterPid: number;
    waiterUsername: string;
    waiterApp: string;
    waiterQuery: string;
    waitMs: number;
    lockMode: string;
    relation?: string;
  }>;
  lockedRelation?: string;
  lockMode: string;
  severity: string;
}

export interface LockSnapshot {
  totalLocks: number;
  waitingLocks: number;
  grantedLocks: number;
  hasBlockers: boolean;
  hasDeadlockRisk: boolean;
  deadlocksTotal: number;
  byMode: Record<string, number>;
}

export interface TableStat {
  schemaName: string;
  tableName: string;
  liveTuples: number;
  deadTuples: number;
  bloatRatio: number;
  seqScans: number;
  idxScans: number;
  seqScanRatio: number;
  tableSizeBytes: number;
  indexSizeBytes: number;
  totalSizeBytes: number;
  lastVacuum: string | null;
  lastAutovacuum: string | null;
  needsVacuum: boolean;
  needsIndex: boolean;
  hasVacuumDisabled: boolean;
}

export interface IndexStat {
  schemaName: string;
  tableName: string;
  indexName: string;
  indexSizeBytes: number;
  idxScans: number;
  isUnused: boolean;
  isUnique: boolean;
  isPrimary: boolean;
  indexDef: string;
  columns: string[];
}

export interface TableRecommendation {
  type: string;
  severity: "critical" | "warning" | "info";
  targetName: string;
  message: string;
  command: string;
}

export interface TableSnapshot {
  tables: TableStat[];
  indexes: IndexStat[];
  totalTableSizeBytes: number;
  totalIndexSizeBytes: number;
  tablesNeedingVacuum: number;
  unusedIndexCount: number;
  unusedIndexSizeBytes: number;
  recommendations: TableRecommendation[];
}

export interface VacuumSnapshot {
  activeVacuums: Array<{
    pid: number;
    tableName: string;
    schemaName: string;
    phase: string;
    heapBlksTotal: number;
    heapBlksScanned: number;
    progressPct: number;
    isAutovacuum: boolean;
  }>;
  xidAgeRisk: Array<{
    schemaName: string;
    tableName: string;
    age: number;
    ageStatus: "warning" | "critical" | "emergency";
  }>;
  maxXidAge: number;
  databaseAge: number;
  hasXidRisk: boolean;
  autovacuum: {
    activeWorkers: number;
    maxWorkers: number;
    tablesPendingVacuum: number;
    tablesPendingAnalyze: number;
  };
  settings: {
    autovacuumEnabled: boolean;
    autovacuumMaxWorkers: number;
    vacuumFreezeMaxAge: number;
    autovacuumFreezeMaxAge: number;
  };
}

export interface ReplicaInfo {
  pid: number;
  clientAddr: string;
  applicationName: string;
  state: string;
  syncState: string;
  writeLagBytes: number;
  flushLagBytes: number;
  replayLagBytes: number;
  totalLagBytes: number;
  writeLagMs: number | null;
  flushLagMs: number | null;
  replayLagMs: number | null;
  replyTime: string | null;
}

export interface ReplicationSlot {
  slotName: string;
  slotType: string;
  plugin: string | null;
  active: boolean;
  activePid: number | null;
  walBytes: number;
  isBlocking: boolean;
  database: string | null;
}

export interface ReplicationSnapshot {
  isPrimary: boolean;
  hasReplicas: boolean;
  primaryLsn: string | null;
  walSizeBytes: number;
  replicas: ReplicaInfo[];
  maxLagBytes: number;
  hasLaggedReplicas: boolean;
  slots: ReplicationSlot[];
  hasInactiveSlots: boolean;
  totalWalRetained: number;
  receiverInfo: {
    status: string;
    receivedLsn: string | null;
    latencyMs: number | null;
    lastMsgReceiptTime: string | null;
  } | null;
}

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  operator: "gt" | "gte" | "lt" | "lte";
  threshold: number;
  severity: "info" | "warning" | "critical";
  enabled: boolean;
  cooldownMs: number;
  notifyChannels: string[];
}

export interface AlertEvent {
  id: string;
  triggeredAt: string;
  resolvedAt: string | null;
  currentValue: number;
  message: string;
  acknowledged: boolean;
  rule: { name: string; metric: string; severity: string };
}

export interface PgSetting {
  name: string;
  setting: string;
  unit: string | null;
  category: string;
  shortDesc: string;
  context: string;
  source: string;
  vartype: string;
  isPendingRestart: boolean;
}

export interface SystemSnapshot {
  server: {
    version: string;
    majorVersion: number;
    dataDirectory: string;
    timezone: string;
    serverEncoding: string;
    maxConnections: number;
    uptimeHours: number;
    postmasterStartTime: string | null;
  };
  databases: Array<{
    name: string;
    owner: string;
    sizeBytes: number;
    sizeHuman: string;
    ageXid: number;
    connections: number;
    isTemplate: boolean;
  }>;
  extensions: Array<{
    name: string;
    version: string;
    schemaName: string;
    comment: string | null;
  }>;
  roles: Array<{
    name: string;
    isSuperuser: boolean;
    canLogin: boolean;
    connectionLimit: number;
  }>;
  keySettings: Record<string, string>;
  totalDatabaseSize: number;
  configIssues: Array<{
    setting: string;
    current: string;
    recommended: string;
    reason: string;
    severity: string;
  }>;
}

export interface TimePoint {
  time: string;
  value: number;
}

export interface ConnectionTrendPoint {
  time: string;
  total: number;
  active: number;
  idle: number;
  idleInTx: number;
  waiting: number;
  utilizationPct: number;
}

export interface DashboardSummary {
  connections: {
    total: number;
    active: number;
    idle: number;
    idleInTx: number;
    utilizationPct: number;
    maxConnections: number;
    longestQueryMs: number;
  } | null;
  slowQueriesCount: number;
  lockWaitsCount: number;
  avgCacheHitRatio: number;
  deadlocksTotal: number;
  hasXidRisk: boolean;
  maxXidAge: number;
  activeVacuums: number;
  replicationLagMb: number | null;
  activeAlertsCount: number;
  criticalAlertsCount: number;
}
