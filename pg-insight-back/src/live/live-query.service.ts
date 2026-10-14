import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { TargetPoolManager } from '../targets/target-pool.manager';
import { PrismaService } from '../database/prisma.service';

const EXPLAIN_STATEMENT_TIMEOUT = '5s';
const EXPLAIN_LOCK_TIMEOUT = '1s';
const SYNC_REPLY_MAX_AGE_SEC = 10;
const BLOAT_STATEMENT_TIMEOUT = '5s';
const BLOAT_MAX_TABLE_BYTES = 8 * 1024 ** 3;
const BLOAT_MIN_TABLE_BYTES = 1024 ** 2;
const EXPLAIN_FORBIDDEN_FUNCTIONS =
  /\b(pg_terminate_backend|pg_cancel_backend|pg_sleep\w*|pg_(try_)?advisory\w*|set_config|dblink\w*|lo_\w+|pg_read_\w*file|pg_ls_\w+|pg_stat_file|pg_reload_conf|pg_rotate_logfile|pg_notify|pg_logical_emit_message|query_to_xml\w*|cursor_to_xml\w*|table_to_xml\w*|database_to_xml\w*|schema_to_xml\w*)"?\s*\(/i;

export function parseRequiredSyncStandbys(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const match = /^(?:(?:ANY|FIRST)\s+)?(\d+)\s*\(/i.exec(trimmed);
  return match ? Math.max(1, parseInt(match[1], 10)) : 1;
}

@Injectable()
export class LiveQueryService {
  private readonly logger = new Logger(LiveQueryService.name);

  constructor(
    private readonly poolManager: TargetPoolManager,
    private readonly prisma: PrismaService,
  ) {}

  async getConnections(targetId: string, minMs = 0, limit = 200, offset = 0) {
    const rows = await this.poolManager.query<Record<string, unknown>>(
      targetId,
      `
      SELECT
        pid, usename AS username, application_name,
        client_addr::text AS client_addr, datname AS db_name,
        state, wait_event_type, wait_event,
        EXTRACT(EPOCH FROM (now() - query_start))  * 1000 AS query_duration_ms,
        EXTRACT(EPOCH FROM (now() - xact_start))   * 1000 AS xact_duration_ms,
        query, backend_type
      FROM pg_stat_activity
      WHERE pid != pg_backend_pid()
        AND datname IS NOT NULL
        AND COALESCE(EXTRACT(EPOCH FROM (now() - query_start)) * 1000, 0) >= $1
      ORDER BY query_duration_ms DESC NULLS LAST
    `,
      [minMs],
    );

    const sessions = rows.map((r) => ({
      pid: Number(r.pid),
      username: String(r.username ?? ''),
      applicationName: String(r.application_name ?? ''),
      clientAddr: r.client_addr ? String(r.client_addr) : null,
      dbName: String(r.db_name ?? ''),
      state: String(r.state ?? 'unknown'),
      waitEventType: r.wait_event_type ? String(r.wait_event_type) : null,
      waitEvent: r.wait_event ? String(r.wait_event) : null,
      queryDurationMs: Math.round(Number(r.query_duration_ms) || 0),
      xactDurationMs: Math.round(Number(r.xact_duration_ms) || 0),
      query: r.query ? String(r.query) : null,
      backendType: String(r.backend_type ?? ''),
      isLongRunning: Number(r.query_duration_ms) > 30_000,
      isIdleInTx: String(r.state).startsWith('idle in transaction'),
      isWaitingForLock: r.wait_event_type === 'Lock',
    }));

    const maxConnResult = await this.poolManager.query<{
      max_connections: string;
    }>(targetId, `SHOW max_connections`);
    const maxConnections = parseInt(
      maxConnResult[0]?.max_connections ?? '100',
      10,
    );

    const byStateMap = new Map<string, number>();
    const byWaitMap = new Map<
      string,
      { waitEventType: string; waitEvent: string | null; count: number }
    >();
    const byAppMap = new Map<string, number>();

    for (const s of sessions) {
      byStateMap.set(s.state, (byStateMap.get(s.state) ?? 0) + 1);
      byAppMap.set(
        s.applicationName || '(unknown)',
        (byAppMap.get(s.applicationName || '(unknown)') ?? 0) + 1,
      );
      if (s.waitEventType) {
        const key = `${s.waitEventType}:${s.waitEvent}`;
        const existing = byWaitMap.get(key);
        if (existing) existing.count++;
        else
          byWaitMap.set(key, {
            waitEventType: s.waitEventType,
            waitEvent: s.waitEvent,
            count: 1,
          });
      }
    }

    const total = sessions.length;
    const pagedSessions = sessions.slice(offset, offset + limit);
    return {
      totalConnections: total,
      activeQueries: sessions.filter((s) => s.state === 'active').length,
      idleConnections: sessions.filter((s) => s.state === 'idle').length,
      idleInTransaction: sessions.filter((s) => s.isIdleInTx).length,
      waitingForLock: sessions.filter((s) => s.isWaitingForLock).length,
      maxConnections,
      connectionUsagePct:
        maxConnections > 0 ? (total / maxConnections) * 100 : 0,
      longestQueryMs: Math.max(0, ...sessions.map((s) => s.queryDurationMs)),
      longestIdleInTxMs: Math.max(
        0,
        ...sessions.filter((s) => s.isIdleInTx).map((s) => s.xactDurationMs),
      ),
      sessions: pagedSessions,
      sessionsTotal: total,
      sessionsOffset: offset,
      byState: Array.from(byStateMap, ([state, count]) => ({ state, count })),
      byWaitEvent: Array.from(byWaitMap.values()),
      byApplication: Array.from(byAppMap, ([applicationName, count]) => ({
        applicationName,
        count,
      })).sort((a, b) => b.count - a.count),
    };
  }

  async getSlowQueries(targetId: string, limit = 50, offset = 0) {
    const entry = this.poolManager.getEntry(targetId);
    if (!entry?.hasStatStatements) {
      return {
        queries: [],
        count: 0,
        total: 0,
        message: 'pg_stat_statements extension not installed',
      };
    }

    const totalRows = await this.poolManager.query<{ total: string }>(
      targetId,
      `
      SELECT count(*) AS total FROM pg_stat_statements
      WHERE query NOT ILIKE '%pg_stat_statements%'
    `,
    );
    const total = Number(totalRows[0]?.total) || 0;

    const rows = await this.poolManager.query<Record<string, unknown>>(
      targetId,
      `
      SELECT
        queryid::text AS query_id, query AS query_text, calls,
        total_exec_time AS total_time_ms, mean_exec_time AS mean_time_ms,
        max_exec_time AS max_time_ms, stddev_exec_time AS stddev_time_ms,
        CASE WHEN calls > 0 THEN rows::float / calls ELSE 0 END AS rows_per_call,
        CASE WHEN (shared_blks_hit + shared_blks_read) > 0
          THEN shared_blks_hit::float / (shared_blks_hit + shared_blks_read)
          ELSE 1 END AS cache_hit_ratio
      FROM pg_stat_statements
      WHERE query NOT ILIKE '%pg_stat_statements%'
      ORDER BY mean_exec_time DESC
      LIMIT $1 OFFSET $2
    `,
      [limit, offset],
    );

    const queries = rows.map((r) => {
      const meanMs = Number(r.mean_time_ms) || 0;
      const maxMs = Number(r.max_time_ms) || 0;
      const stddevMs = Number(r.stddev_time_ms) || 0;
      const calls = Number(r.calls) || 0;
      const cacheHit = Number(r.cache_hit_ratio) || 0;
      const rowsPerCall = Number(r.rows_per_call) || 0;

      const tags: string[] = [];
      if (meanMs > 10_000) tags.push('very-slow');
      else if (meanMs > 1_000) tags.push('slow');
      if (stddevMs > meanMs * 2 && calls > 10) tags.push('inconsistent');
      if (cacheHit < 0.9) tags.push('low-cache');
      if (rowsPerCall > 10_000) tags.push('high-rows');
      if (calls > 10_000) tags.push('frequent');
      if (/^\s*(insert|update|delete)/i.test(String(r.query_text)))
        tags.push('write-heavy');

      return {
        queryId: r.query_id,
        queryText: r.query_text,
        calls,
        totalTimeMs: Number(r.total_time_ms) || 0,
        meanTimeMs: meanMs,
        maxTimeMs: maxMs,
        stddevTimeMs: stddevMs,
        rowsPerCall,
        cacheHitRatio: cacheHit,
        tags,
        isSlow: meanMs > 1_000,
        isFrequent: calls > 10_000,
      };
    });

    return { queries, count: queries.length, total, offset };
  }

  async explainQuery(targetId: string, sql: string, analyze = false) {
    const withoutComments = sql
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();

    const trimmed = withoutComments.replace(/;+\s*$/, '');

    if (trimmed.includes(';')) {
      throw new BadRequestException('Multiple statements are not allowed');
    }

    if (!/^\s*(select|with)\b/i.test(trimmed)) {
      throw new BadRequestException(
        'Only SELECT / WITH queries can be explained',
      );
    }

    if (
      /\b(insert|update|delete|drop|truncate|alter|grant|revoke|create|call|do|copy|vacuum|reindex)\b/i.test(
        trimmed,
      )
    ) {
      throw new BadRequestException('Query contains forbidden keywords');
    }

    if (EXPLAIN_FORBIDDEN_FUNCTIONS.test(trimmed)) {
      throw new BadRequestException(
        'Query calls a function that is not allowed',
      );
    }

    const pool = this.poolManager.getPool(targetId);
    if (!pool) throw new BadRequestException('Target is not connected');

    const client = await pool.connect();
    const start = Date.now();
    try {
      await client.query(
        `BEGIN TRANSACTION READ ONLY; SET LOCAL statement_timeout = '${EXPLAIN_STATEMENT_TIMEOUT}'; SET LOCAL lock_timeout = '${EXPLAIN_LOCK_TIMEOUT}'`,
      );
      const options = analyze ? 'ANALYZE, BUFFERS, FORMAT JSON' : 'FORMAT JSON';
      const result = await client.query<{ 'QUERY PLAN': unknown }>(
        `EXPLAIN (${options}) ${trimmed}`,
      );
      await client.query('ROLLBACK');
      const executionTimeMs = Date.now() - start;
      const plan = (result.rows[0] as unknown as Record<string, unknown>)[
        'QUERY PLAN'
      ];

      const recommendations: string[] = [];
      const planStr = JSON.stringify(plan);
      if (planStr.includes('Seq Scan')) {
        recommendations.push(
          '⚠ Sequential scan detected — consider adding an index on the filtered column',
        );
      }
      if (planStr.includes('"Rows Removed by Filter"')) {
        recommendations.push(
          'Query filters rows after fetching — an index could filter earlier',
        );
      }
      if (executionTimeMs > 1000) {
        recommendations.push(
          'Execution took over 1s — review join order and index usage',
        );
      }

      return {
        plan: [plan],
        executionTimeMs,
        recommendations,
        analyzed: analyze,
      };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {}
      const message = (error as Error).message ?? '';
      if ((error as { code?: string }).code === '57014') {
        throw new BadRequestException(
          `Query exceeded the ${EXPLAIN_STATEMENT_TIMEOUT} EXPLAIN time limit`,
        );
      }
      if (/read-only transaction/i.test(message)) {
        throw new BadRequestException(
          'Query attempted a write operation — only read-only queries are allowed',
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async cancelQuery(targetId: string, pid: number) {
    await this.poolManager.query(targetId, `SELECT pg_cancel_backend($1)`, [
      pid,
    ]);
    return { cancelled: true, pid };
  }

  async getAllLocks(targetId: string) {
    const rows = await this.poolManager.query<Record<string, unknown>>(
      targetId,
      `
      SELECT l.mode, l.granted, count(*) AS cnt
      FROM pg_locks l
      WHERE l.pid != pg_backend_pid()
      GROUP BY l.mode, l.granted
    `,
    );

    const byMode: Record<string, number> = {};
    let totalLocks = 0,
      waitingLocks = 0,
      grantedLocks = 0;
    for (const r of rows) {
      const cnt = Number(r.cnt);
      totalLocks += cnt;
      if (r.granted) grantedLocks += cnt;
      else waitingLocks += cnt;
      byMode[String(r.mode)] = (byMode[String(r.mode)] ?? 0) + cnt;
    }

    const deadlockResult = await this.poolManager.query<{ deadlocks: string }>(
      targetId,
      `
      SELECT deadlocks FROM pg_stat_database WHERE datname = current_database()
    `,
    );

    return {
      totalLocks,
      waitingLocks,
      grantedLocks,
      hasBlockers: waitingLocks > 0,
      hasDeadlockRisk: waitingLocks > 5,
      deadlocksTotal: Number(deadlockResult[0]?.deadlocks) || 0,
      byMode,
    };
  }

  async getLockChains(targetId: string) {
    const rows = await this.poolManager.query<Record<string, unknown>>(
      targetId,
      `
      SELECT
        blocking.pid AS blocker_pid,
        blocking_act.usename AS blocker_username,
        blocking_act.application_name AS blocker_app,
        blocking_act.query AS blocker_query,
        EXTRACT(EPOCH FROM (now() - blocking_act.query_start)) * 1000 AS blocker_query_ms,
        blocking_act.state AS blocker_state,
        waiting.pid AS waiter_pid,
        waiting_act.usename AS waiter_username,
        waiting_act.application_name AS waiter_app,
        waiting_act.query AS waiter_query,
        EXTRACT(EPOCH FROM (now() - waiting.waitstart)) * 1000 AS wait_ms,
        waiting.mode AS lock_mode,
        waiting.relation::regclass::text AS locked_relation
      FROM pg_locks waiting
      JOIN pg_stat_activity waiting_act ON waiting_act.pid = waiting.pid
      JOIN pg_locks blocking ON (
        blocking.locktype = waiting.locktype AND
        blocking.database IS NOT DISTINCT FROM waiting.database AND
        blocking.relation IS NOT DISTINCT FROM waiting.relation AND
        blocking.page IS NOT DISTINCT FROM waiting.page AND
        blocking.tuple IS NOT DISTINCT FROM waiting.tuple AND
        blocking.pid != waiting.pid AND blocking.granted
      )
      JOIN pg_stat_activity blocking_act ON blocking_act.pid = blocking.pid
      WHERE NOT waiting.granted
      ORDER BY wait_ms DESC NULLS LAST
    `,
    );

    const chainsMap = new Map<
      number,
      {
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
      }
    >();

    for (const r of rows) {
      const blockerPid = Number(r.blocker_pid);
      if (!chainsMap.has(blockerPid)) {
        chainsMap.set(blockerPid, {
          blockerPid,
          blockerUsername: String(r.blocker_username),
          blockerApp: String(r.blocker_app ?? ''),
          blockerQuery: String(r.blocker_query ?? ''),
          blockerQueryMs: Math.round(Number(r.blocker_query_ms) || 0),
          blockerState: String(r.blocker_state),
          waiters: [],
          lockedRelation: r.locked_relation
            ? String(r.locked_relation)
            : undefined,
          lockMode: String(r.lock_mode),
        });
      }
      chainsMap.get(blockerPid)!.waiters.push({
        waiterPid: Number(r.waiter_pid),
        waiterUsername: String(r.waiter_username),
        waiterApp: String(r.waiter_app ?? ''),
        waiterQuery: String(r.waiter_query ?? ''),
        waitMs: Math.round(Number(r.wait_ms) || 0),
        lockMode: String(r.lock_mode),
        relation: r.locked_relation ? String(r.locked_relation) : undefined,
      });
    }

    const chains = Array.from(chainsMap.values()).map((c) => {
      const maxWaitMs = Math.max(0, ...c.waiters.map((w) => w.waitMs));
      const severity =
        maxWaitMs > 60_000 || c.waiters.length > 5
          ? 'critical'
          : maxWaitMs > 10_000 || c.waiters.length > 2
            ? 'high'
            : 'warning';
      return { ...c, severity };
    });

    return {
      count: chains.length,
      hasCritical: chains.some((c) => c.severity === 'critical'),
      chains,
    };
  }

  async getTableStats(targetId: string) {
    const tableRows = await this.poolManager.query<Record<string, unknown>>(
      targetId,
      `
      SELECT
        schemaname AS schema_name, relname AS table_name,
        n_live_tup AS live_tuples, n_dead_tup AS dead_tuples,
        CASE WHEN n_live_tup > 0
          THEN n_dead_tup::float / (n_live_tup + n_dead_tup) ELSE 0 END AS bloat_ratio,
        seq_scan AS seq_scans, idx_scan AS idx_scans,
        CASE WHEN (seq_scan + COALESCE(idx_scan,0)) > 0
          THEN seq_scan::float / (seq_scan + COALESCE(idx_scan,0)) ELSE 0 END AS seq_scan_ratio,
        pg_table_size(relid) AS table_size_bytes,
        pg_indexes_size(relid) AS index_size_bytes,
        pg_total_relation_size(relid) AS total_size_bytes,
        last_vacuum, last_autovacuum
      FROM pg_stat_user_tables
      ORDER BY total_size_bytes DESC
      LIMIT 200
    `,
    );

    const vacuumOffRows = await this.poolManager.query<{ relname: string }>(
      targetId,
      `
      SELECT c.relname FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r' AND n.nspname NOT IN ('pg_catalog','information_schema')
        AND c.reloptions IS NOT NULL
        AND array_to_string(c.reloptions, ',') LIKE '%autovacuum_enabled=false%'
    `,
    );
    const vacuumOffSet = new Set(vacuumOffRows.map((r) => r.relname));

    const tables = tableRows.map((r) => {
      const bloatRatio = Number(r.bloat_ratio) || 0;
      const seqScanRatio = Number(r.seq_scan_ratio) || 0;
      const seqScans = Number(r.seq_scans) || 0;
      return {
        schemaName: String(r.schema_name),
        tableName: String(r.table_name),
        liveTuples: Number(r.live_tuples) || 0,
        deadTuples: Number(r.dead_tuples) || 0,
        bloatRatio,
        seqScans,
        idxScans: Number(r.idx_scans) || 0,
        seqScanRatio,
        tableSizeBytes: Number(r.table_size_bytes) || 0,
        indexSizeBytes: Number(r.index_size_bytes) || 0,
        totalSizeBytes: Number(r.total_size_bytes) || 0,
        lastVacuum: r.last_vacuum,
        lastAutovacuum: r.last_autovacuum,
        needsVacuum: bloatRatio > 0.2,
        needsIndex: seqScanRatio > 0.5 && seqScans > 100,
        hasVacuumDisabled: vacuumOffSet.has(String(r.table_name)),
      };
    });

    const indexRows = await this.poolManager
      .query<Record<string, unknown>>(
        targetId,
        `
      SELECT
        schemaname AS schema_name, relname AS table_name, indexrelname AS index_name,
        pg_relation_size(indexrelid) AS index_size_bytes, idx_scan AS idx_scans,
        indexdef AS index_def
      FROM pg_stat_user_indexes
      JOIN pg_index USING (indexrelid)
      ORDER BY index_size_bytes DESC
      LIMIT 300
    `.replace(
          'indexdef AS index_def',
          `(SELECT indexdef FROM pg_indexes WHERE indexname = indexrelname LIMIT 1) AS index_def`,
        ),
      )
      .catch(async () =>
        this.poolManager.query<Record<string, unknown>>(
          targetId,
          `
        SELECT
          s.schemaname AS schema_name, s.relname AS table_name, s.indexrelname AS index_name,
          pg_relation_size(s.indexrelid) AS index_size_bytes, s.idx_scan AS idx_scans,
          i.indexdef AS index_def, ix.indisunique AS is_unique, ix.indisprimary AS is_primary
        FROM pg_stat_user_indexes s
        JOIN pg_indexes i ON i.indexname = s.indexrelname AND i.schemaname = s.schemaname
        JOIN pg_index ix ON ix.indexrelid = s.indexrelid
        ORDER BY index_size_bytes DESC
        LIMIT 300
      `,
        ),
      );

    const indexes = indexRows.map((r) => {
      const def = String(r.index_def ?? '');
      const colMatch = def.match(/\(([^)]+)\)/);
      return {
        schemaName: String(r.schema_name),
        tableName: String(r.table_name),
        indexName: String(r.index_name),
        indexSizeBytes: Number(r.index_size_bytes) || 0,
        idxScans: Number(r.idx_scans) || 0,
        isUnused: (Number(r.idx_scans) || 0) === 0,
        isUnique: Boolean(r.is_unique) || def.includes('UNIQUE'),
        isPrimary:
          Boolean(r.is_primary) || String(r.index_name).endsWith('_pkey'),
        indexDef: def,
        columns: colMatch ? colMatch[1].split(',').map((c) => c.trim()) : [],
      };
    });

    const totalTableSizeBytes = tables.reduce(
      (s, t) => s + t.tableSizeBytes,
      0,
    );
    const totalIndexSizeBytes = tables.reduce(
      (s, t) => s + t.indexSizeBytes,
      0,
    );
    const unusedIndexes = indexes.filter((i) => i.isUnused && !i.isPrimary);

    const recommendations: Array<{
      type: string;
      severity: string;
      targetName: string;
      message: string;
      command: string;
    }> = [];
    for (const t of tables.filter((t) => t.needsVacuum).slice(0, 5)) {
      recommendations.push({
        type: 'vacuum',
        severity: t.bloatRatio > 0.4 ? 'critical' : 'warning',
        targetName: `${t.schemaName}.${t.tableName}`,
        message: `${t.tableName} has ${(t.bloatRatio * 100).toFixed(0)}% dead tuple bloat`,
        command: `VACUUM (ANALYZE) ${t.schemaName}.${t.tableName};`,
      });
    }
    for (const i of unusedIndexes.slice(0, 5)) {
      recommendations.push({
        type: 'unused_index',
        severity: 'info',
        targetName: `${i.schemaName}.${i.indexName}`,
        message: `Index ${i.indexName} has never been used and wastes disk space`,
        command: `DROP INDEX CONCURRENTLY ${i.schemaName}.${i.indexName};`,
      });
    }
    for (const t of tables.filter((t) => t.needsIndex).slice(0, 5)) {
      recommendations.push({
        type: 'missing_index',
        severity: 'warning',
        targetName: `${t.schemaName}.${t.tableName}`,
        message: `${t.tableName} is scanned sequentially ${(t.seqScanRatio * 100).toFixed(0)}% of the time`,
        command: `-- Review WHERE clauses on ${t.tableName} and add a matching index`,
      });
    }

    return {
      tables,
      indexes,
      totalTableSizeBytes,
      totalIndexSizeBytes,
      tablesNeedingVacuum: tables.filter((t) => t.needsVacuum).length,
      unusedIndexCount: unusedIndexes.length,
      unusedIndexSizeBytes: unusedIndexes.reduce(
        (s, i) => s + i.indexSizeBytes,
        0,
      ),
      recommendations,
    };
  }

  async getTableBloat(targetId: string, limit = 10): Promise<TableBloatReport> {
    const started = Date.now();
    const fnRows = await this.poolManager
      .query<{ schema_name: string; can_execute: boolean }>(
        targetId,
        `
      SELECT n.nspname AS schema_name, has_function_privilege(p.oid, 'EXECUTE') AS can_execute
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = 'pgstattuple_approx'
      ORDER BY n.nspname
      LIMIT 1
    `,
      )
      .catch(() => []);
    const fnSchema = fnRows[0]?.schema_name ?? null;
    const canExecute = Boolean(fnRows[0]?.can_execute);
    const useApprox = fnSchema !== null && canExecute;

    const candidates = await this.poolManager.query<Record<string, unknown>>(
      targetId,
      `
      SELECT c.oid::bigint AS relid, n.nspname AS schema_name, c.relname AS table_name,
        pg_relation_size(c.oid) AS table_bytes, s.n_live_tup, s.n_dead_tup
      FROM pg_stat_user_tables s
      JOIN pg_class c ON c.oid = s.relid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE pg_relation_size(c.oid) >= $2
      ORDER BY s.n_dead_tup DESC, pg_relation_size(c.oid) DESC
      LIMIT $1
    `,
      [Math.min(Math.max(limit, 1), 25), BLOAT_MIN_TABLE_BYTES],
    );

    const estimate = (r: Record<string, unknown>): TableBloatEntry => {
      const live = Number(r.n_live_tup) || 0;
      const dead = Number(r.n_dead_tup) || 0;
      const tableBytes = Number(r.table_bytes) || 0;
      const deadRatio = live + dead > 0 ? dead / (live + dead) : 0;
      return {
        schemaName: String(r.schema_name),
        tableName: String(r.table_name),
        tableBytes,
        wastedBytes: Math.round(tableBytes * deadRatio),
        wastedPct: deadRatio * 100,
        deadTuplePct: deadRatio * 100,
        freePct: null,
        scannedPct: null,
        method: 'dead_tuples',
      };
    };

    let tables: TableBloatEntry[];
    if (!useApprox) {
      tables = candidates.map(estimate);
    } else {
      tables = [];
      const pool = this.poolManager.getPool(targetId);
      if (!pool) throw new BadRequestException('Target is not connected');
      const client = await pool.connect();
      const fn = `"${fnSchema.replace(/"/g, '""')}".pgstattuple_approx`;
      try {
        await client.query(
          `BEGIN TRANSACTION READ ONLY; SET LOCAL statement_timeout = '${BLOAT_STATEMENT_TIMEOUT}'`,
        );
        for (const r of candidates) {
          const tableBytes = Number(r.table_bytes) || 0;
          if (tableBytes > BLOAT_MAX_TABLE_BYTES) {
            tables.push({ ...estimate(r), method: 'skipped_large' });
            continue;
          }
          try {
            await client.query('SAVEPOINT bloat_probe');
            const res = await client.query<Record<string, unknown>>(
              `SELECT table_len, scanned_percent, dead_tuple_len, dead_tuple_percent, approx_free_space, approx_free_percent FROM ${fn}($1::oid::regclass)`,
              [String(r.relid)],
            );
            await client.query('RELEASE SAVEPOINT bloat_probe');
            const row = res.rows[0] ?? {};
            const deadLen = Number(row.dead_tuple_len) || 0;
            const free = Number(row.approx_free_space) || 0;
            const deadPct = Number(row.dead_tuple_percent) || 0;
            const freePct = Number(row.approx_free_percent) || 0;
            tables.push({
              schemaName: String(r.schema_name),
              tableName: String(r.table_name),
              tableBytes: Number(row.table_len) || tableBytes,
              wastedBytes: Math.round(deadLen + free),
              wastedPct: deadPct + freePct,
              deadTuplePct: deadPct,
              freePct,
              scannedPct: Number(row.scanned_percent) || 0,
              method: 'pgstattuple_approx',
            });
          } catch (err) {
            await client.query('ROLLBACK TO SAVEPOINT bloat_probe');
            this.logger.warn(
              `pgstattuple_approx failed for ${String(r.schema_name)}.${String(r.table_name)}: ${(err as Error).message}`,
            );
            tables.push({ ...estimate(r), method: 'failed' });
          }
        }
      } finally {
        await client.query('ROLLBACK').catch(() => undefined);
        client.release();
      }
    }

    tables.sort((a, b) => b.wastedBytes - a.wastedBytes);

    return {
      method: useApprox ? 'pgstattuple_approx' : 'dead_tuples',
      extensionInstalled: fnSchema !== null,
      canExecute,
      installCommand: 'CREATE EXTENSION IF NOT EXISTS pgstattuple;',
      grantCommand:
        fnSchema !== null && !canExecute
          ? 'GRANT pg_stat_scan_tables TO <monitoring_user>;'
          : null,
      measuredAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      tables,
    };
  }

  async getVacuumProgress(targetId: string) {
    const activeRows = await this.poolManager.query<Record<string, unknown>>(
      targetId,
      `
      SELECT
        p.pid, c.relname AS table_name, n.nspname AS schema_name,
        p.phase, p.heap_blks_total, p.heap_blks_scanned,
        a.query ILIKE 'autovacuum%' AS is_autovacuum
      FROM pg_stat_progress_vacuum p
      JOIN pg_class c ON c.oid = p.relid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_stat_activity a ON a.pid = p.pid
    `,
    );

    const activeVacuums = activeRows.map((r) => {
      const total = Number(r.heap_blks_total) || 0;
      const scanned = Number(r.heap_blks_scanned) || 0;
      return {
        pid: Number(r.pid),
        tableName: String(r.table_name),
        schemaName: String(r.schema_name),
        phase: String(r.phase),
        heapBlksTotal: total,
        heapBlksScanned: scanned,
        progressPct: total > 0 ? (scanned / total) * 100 : 0,
        isAutovacuum: Boolean(r.is_autovacuum),
      };
    });

    const xidRows = await this.poolManager.query<Record<string, unknown>>(
      targetId,
      `
      SELECT n.nspname AS schema_name, c.relname AS table_name,
        age(c.relfrozenxid) AS age
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r','m') AND n.nspname NOT IN ('pg_catalog','information_schema')
      ORDER BY age DESC LIMIT 20
    `,
    );

    const xidAgeRisk = xidRows
      .map((r) => {
        const age = Number(r.age) || 0;
        const ageStatus =
          age >= 1_500_000_000
            ? 'emergency'
            : age >= 500_000_000
              ? 'critical'
              : 'warning';
        return {
          schemaName: String(r.schema_name),
          tableName: String(r.table_name),
          age,
          ageStatus,
        };
      })
      .filter((t) => t.age >= 200_000_000);

    const dbAgeRows = await this.poolManager.query<{ age: string }>(
      targetId,
      `
      SELECT age(datfrozenxid) AS age FROM pg_database WHERE datname = current_database()
    `,
    );
    const databaseAge = Number(dbAgeRows[0]?.age) || 0;
    const maxXidAge = Math.max(databaseAge, ...xidAgeRisk.map((t) => t.age), 0);

    const mxidRows = await this.poolManager
      .query<{ db_mxid_age: string; max_table_mxid_age: string | null }>(
        targetId,
        `
      SELECT
        mxid_age(d.datminmxid) AS db_mxid_age,
        (SELECT max(mxid_age(c.relminmxid)) FROM pg_class c WHERE c.relkind IN ('r','m','t')) AS max_table_mxid_age
      FROM pg_database d
      WHERE d.datname = current_database()
    `,
      )
      .catch(() => []);
    const databaseMxidAge = Number(mxidRows[0]?.db_mxid_age) || 0;
    const maxMxidAge = Math.max(
      databaseMxidAge,
      Number(mxidRows[0]?.max_table_mxid_age) || 0,
    );

    const settingsRows = await this.poolManager.query<{
      name: string;
      setting: string;
    }>(
      targetId,
      `
      SELECT name, setting FROM pg_settings
      WHERE name IN ('autovacuum','autovacuum_max_workers','vacuum_freeze_table_age','autovacuum_freeze_max_age','autovacuum_multixact_freeze_max_age')
    `,
    );
    const settingsMap = new Map(settingsRows.map((r) => [r.name, r.setting]));

    const workerRows = await this.poolManager.query<{ cnt: string }>(
      targetId,
      `
      SELECT count(*) AS cnt FROM pg_stat_activity WHERE query ILIKE 'autovacuum%'
    `,
    );

    return {
      activeVacuums,
      xidAgeRisk,
      maxXidAge,
      databaseAge,
      hasXidRisk: maxXidAge >= 500_000_000,
      databaseMxidAge,
      maxMxidAge,
      hasMxidRisk: maxMxidAge >= 500_000_000,
      autovacuum: {
        activeWorkers: Number(workerRows[0]?.cnt) || 0,
        maxWorkers: Number(settingsMap.get('autovacuum_max_workers')) || 3,
        tablesPendingVacuum: 0,
        tablesPendingAnalyze: 0,
      },
      settings: {
        autovacuumEnabled: settingsMap.get('autovacuum') === 'on',
        autovacuumMaxWorkers:
          Number(settingsMap.get('autovacuum_max_workers')) || 3,
        vacuumFreezeMaxAge:
          Number(settingsMap.get('vacuum_freeze_table_age')) || 150_000_000,
        autovacuumFreezeMaxAge:
          Number(settingsMap.get('autovacuum_freeze_max_age')) || 200_000_000,
        autovacuumMultixactFreezeMaxAge:
          Number(settingsMap.get('autovacuum_multixact_freeze_max_age')) ||
          400_000_000,
      },
    };
  }

  async getReplication(targetId: string) {
    const statusRows = await this.poolManager.query<{
      is_recovery: boolean;
      sync_names?: string;
      archive_mode?: string;
    }>(
      targetId,
      `
      SELECT
        pg_is_in_recovery() AS is_recovery,
        current_setting('synchronous_standby_names') AS sync_names,
        current_setting('archive_mode') AS archive_mode
    `,
    );
    const isPrimary = !statusRows[0]?.is_recovery;
    const syncStandbyNames = String(statusRows[0]?.sync_names ?? '').trim();
    const archiveMode = String(statusRows[0]?.archive_mode ?? 'off');

    const walSizeRows = await this.poolManager
      .query<{ size: string }>(
        targetId,
        `SELECT COALESCE(sum(size), 0) AS size FROM pg_ls_waldir()`,
      )
      .catch(() => [{ size: '0' }]);

    let replicas: Record<string, unknown>[] = [];
    if (isPrimary) {
      replicas = await this.poolManager.query<Record<string, unknown>>(
        targetId,
        `
        SELECT
          pid, client_addr::text AS client_addr, application_name, state, sync_state,
          sync_priority,
          pg_wal_lsn_diff(sent_lsn, write_lsn) AS write_lag_bytes,
          pg_wal_lsn_diff(sent_lsn, flush_lsn) AS flush_lag_bytes,
          pg_wal_lsn_diff(sent_lsn, replay_lsn) AS replay_lag_bytes,
          pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) AS total_lag_bytes,
          EXTRACT(EPOCH FROM write_lag) * 1000 AS write_lag_ms,
          EXTRACT(EPOCH FROM flush_lag) * 1000 AS flush_lag_ms,
          EXTRACT(EPOCH FROM replay_lag) * 1000 AS replay_lag_ms,
          reply_time,
          EXTRACT(EPOCH FROM (now() - reply_time)) AS reply_age_s
        FROM pg_stat_replication
      `,
      );
    }

    const replicaInfos = replicas.map((r) => {
      const replayLagBytes = Number(r.replay_lag_bytes) || 0;
      return {
        pid: Number(r.pid),
        clientAddr: String(r.client_addr ?? ''),
        applicationName: String(r.application_name ?? ''),
        state: String(r.state),
        syncState: String(r.sync_state),
        syncPriority: Number(r.sync_priority) || 0,
        writeLagBytes: Number(r.write_lag_bytes) || 0,
        flushLagBytes: Number(r.flush_lag_bytes) || 0,
        replayLagBytes,
        totalLagBytes:
          r.total_lag_bytes != null
            ? Number(r.total_lag_bytes) || 0
            : replayLagBytes,
        writeLagMs: r.write_lag_ms != null ? Number(r.write_lag_ms) : null,
        flushLagMs: r.flush_lag_ms != null ? Number(r.flush_lag_ms) : null,
        replayLagMs: r.replay_lag_ms != null ? Number(r.replay_lag_ms) : null,
        replyTime: r.reply_time,
        replyAgeSec: r.reply_age_s != null ? Number(r.reply_age_s) : null,
      };
    });

    const syncRequired = syncStandbyNames
      ? parseRequiredSyncStandbys(syncStandbyNames)
      : 0;
    const syncHealthy = replicaInfos.filter(
      (r) =>
        (r.syncState === 'sync' || r.syncState === 'quorum') &&
        r.state === 'streaming' &&
        r.replyAgeSec !== null &&
        r.replyAgeSec <= SYNC_REPLY_MAX_AGE_SEC,
    ).length;
    const synchronous =
      isPrimary && syncStandbyNames
        ? {
            standbyNames: syncStandbyNames,
            required: syncRequired,
            healthy: syncHealthy,
            satisfied: syncHealthy >= syncRequired,
          }
        : null;

    const currentLsnExpr = isPrimary
      ? 'pg_current_wal_lsn()'
      : 'pg_last_wal_receive_lsn()';
    const slotRows = await this.poolManager.query<Record<string, unknown>>(
      targetId,
      `
      SELECT slot_name, slot_type, plugin, active, active_pid, database,
        to_jsonb(s) ->> 'wal_status' AS wal_status,
        to_jsonb(s) ->> 'safe_wal_size' AS safe_wal_size,
        pg_wal_lsn_diff(${currentLsnExpr}, restart_lsn) AS wal_bytes
      FROM pg_replication_slots s
    `,
    );
    const slots = slotRows.map((r) => {
      const walBytes = Number(r.wal_bytes) || 0;
      const walStatus = r.wal_status ? String(r.wal_status) : null;
      return {
        slotName: String(r.slot_name),
        slotType: String(r.slot_type),
        plugin: r.plugin ? String(r.plugin) : null,
        active: Boolean(r.active),
        activePid: r.active_pid ? Number(r.active_pid) : null,
        walBytes,
        walStatus,
        safeWalSizeBytes:
          r.safe_wal_size != null ? Number(r.safe_wal_size) : null,
        isBlocking:
          walBytes > 1024 ** 3 ||
          walStatus === 'unreserved' ||
          walStatus === 'lost',
        database: r.database ? String(r.database) : null,
      };
    });

    let receiverInfo: {
      status: string;
      receivedLsn: string | null;
      latencyMs: number | null;
      lastMsgReceiptTime: unknown;
      senderHost: string | null;
      senderPort: number | null;
      slotName: string | null;
    } | null = null;
    let standby: {
      receiveLsn: string | null;
      replayLsn: string | null;
      replayGapBytes: number;
      lastReplayAt: unknown;
      replayDelaySec: number | null;
      paused: boolean;
    } | null = null;
    if (!isPrimary) {
      const recvRows = await this.poolManager
        .query<Record<string, unknown>>(
          targetId,
          `
        SELECT status,
          COALESCE(to_jsonb(r) ->> 'flushed_lsn', to_jsonb(r) ->> 'received_lsn') AS received_lsn,
          EXTRACT(EPOCH FROM (now() - last_msg_receipt_time)) * 1000 AS latency_ms,
          last_msg_receipt_time,
          to_jsonb(r) ->> 'sender_host' AS sender_host,
          to_jsonb(r) ->> 'sender_port' AS sender_port,
          slot_name
        FROM pg_stat_wal_receiver r
      `,
        )
        .catch(() => []);
      if (recvRows[0]) {
        receiverInfo = {
          status: String(recvRows[0].status),
          receivedLsn: recvRows[0].received_lsn
            ? String(recvRows[0].received_lsn)
            : null,
          latencyMs:
            recvRows[0].latency_ms != null
              ? Number(recvRows[0].latency_ms)
              : null,
          lastMsgReceiptTime: recvRows[0].last_msg_receipt_time,
          senderHost: recvRows[0].sender_host
            ? String(recvRows[0].sender_host)
            : null,
          senderPort: recvRows[0].sender_port
            ? Number(recvRows[0].sender_port)
            : null,
          slotName: recvRows[0].slot_name
            ? String(recvRows[0].slot_name)
            : null,
        };
      }

      const replayRows = await this.poolManager
        .query<Record<string, unknown>>(
          targetId,
          `
        SELECT
          pg_last_wal_receive_lsn()::text AS receive_lsn,
          pg_last_wal_replay_lsn()::text AS replay_lsn,
          pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn()) AS replay_gap_bytes,
          pg_last_xact_replay_timestamp() AS last_replay_at,
          EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) AS replay_delay_s,
          pg_is_wal_replay_paused() AS paused
      `,
        )
        .catch(() => []);
      if (replayRows[0]) {
        standby = {
          receiveLsn: replayRows[0].receive_lsn
            ? String(replayRows[0].receive_lsn)
            : null,
          replayLsn: replayRows[0].replay_lsn
            ? String(replayRows[0].replay_lsn)
            : null,
          replayGapBytes: Math.max(
            0,
            Number(replayRows[0].replay_gap_bytes) || 0,
          ),
          lastReplayAt: replayRows[0].last_replay_at ?? null,
          replayDelaySec:
            replayRows[0].replay_delay_s != null
              ? Number(replayRows[0].replay_delay_s)
              : null,
          paused: Boolean(replayRows[0].paused),
        };
      }
    }

    const archiver = await this.getArchiverStatus(
      targetId,
      archiveMode,
      isPrimary,
    );

    return {
      isPrimary,
      hasReplicas: replicaInfos.length > 0,
      primaryLsn: null,
      walSizeBytes: Number(walSizeRows[0]?.size) || 0,
      replicas: replicaInfos,
      maxLagBytes: Math.max(0, ...replicaInfos.map((r) => r.totalLagBytes)),
      hasLaggedReplicas: replicaInfos.some(
        (r) => r.totalLagBytes > 50 * 1024 * 1024,
      ),
      slots,
      hasInactiveSlots: slots.some(
        (s) => !s.active && s.walBytes > 100 * 1024 * 1024,
      ),
      totalWalRetained: slots.reduce((s, sl) => s + sl.walBytes, 0),
      receiverInfo,
      standby,
      synchronous,
      archiver,
    };
  }

  private async getArchiverStatus(
    targetId: string,
    archiveMode: string,
    isPrimary: boolean,
  ): Promise<ArchiverStatus> {
    const enabled =
      archiveMode === 'always' || (archiveMode === 'on' && isPrimary);
    const rows = await this.poolManager
      .query<Record<string, unknown>>(
        targetId,
        `
      SELECT archived_count, last_archived_wal, last_archived_time,
        failed_count, last_failed_wal, last_failed_time,
        EXTRACT(EPOCH FROM (now() - last_archived_time)) AS last_archived_age_s
      FROM pg_stat_archiver
    `,
      )
      .catch(() => []);
    const readyRows = enabled
      ? await this.poolManager
          .query<{ ready: string }>(
            targetId,
            `SELECT count(*) AS ready FROM pg_ls_archive_statusdir() WHERE name LIKE '%.ready'`,
          )
          .catch(() => null)
      : null;

    const row = rows[0] ?? {};
    const lastArchivedTime = row.last_archived_time
      ? new Date(row.last_archived_time as string)
      : null;
    const lastFailedTime = row.last_failed_time
      ? new Date(row.last_failed_time as string)
      : null;
    const failedCount = Number(row.failed_count) || 0;
    const failing =
      enabled &&
      failedCount > 0 &&
      lastFailedTime !== null &&
      (lastArchivedTime === null || lastFailedTime > lastArchivedTime);

    return {
      mode: archiveMode,
      enabled,
      archivedCount: Number(row.archived_count) || 0,
      lastArchivedWal: row.last_archived_wal
        ? String(row.last_archived_wal)
        : null,
      lastArchivedTime: lastArchivedTime
        ? lastArchivedTime.toISOString()
        : null,
      lastArchivedAgeSec:
        row.last_archived_age_s != null
          ? Number(row.last_archived_age_s)
          : null,
      failedCount,
      lastFailedWal: row.last_failed_wal ? String(row.last_failed_wal) : null,
      lastFailedTime: lastFailedTime ? lastFailedTime.toISOString() : null,
      readyCount: readyRows ? Number(readyRows[0]?.ready) || 0 : null,
      failing,
    };
  }

  async getSystemInfo(targetId: string) {
    const serverRows = await this.poolManager.query<Record<string, unknown>>(
      targetId,
      `
      SELECT
        version() AS version, current_setting('data_directory') AS data_directory,
        current_setting('TimeZone') AS timezone, current_setting('server_encoding') AS server_encoding,
        current_setting('max_connections')::int AS max_connections,
        EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time())) / 3600 AS uptime_hours,
        pg_postmaster_start_time() AS postmaster_start_time
    `,
    );
    const s = serverRows[0];

    const dbRows = await this.poolManager.query<Record<string, unknown>>(
      targetId,
      `
      SELECT
        d.datname AS name, pg_get_userbyid(d.datdba) AS owner,
        pg_database_size(d.datname) AS size_bytes,
        pg_size_pretty(pg_database_size(d.datname)) AS size_human,
        age(d.datfrozenxid) AS age_xid,
        (SELECT count(*) FROM pg_stat_activity WHERE datname = d.datname) AS connections,
        d.datistemplate AS is_template
      FROM pg_database d
      WHERE NOT d.datistemplate
      ORDER BY size_bytes DESC
    `,
    );

    const extRows = await this.poolManager.query<Record<string, unknown>>(
      targetId,
      `
      SELECT e.extname AS name, e.extversion AS version, n.nspname AS schema_name,
        obj_description(e.oid, 'pg_extension') AS comment
      FROM pg_extension e
      JOIN pg_namespace n ON n.oid = e.extnamespace
      ORDER BY e.extname
    `,
    );

    const roleRows = await this.poolManager.query<Record<string, unknown>>(
      targetId,
      `
      SELECT rolname AS name, rolsuper AS is_superuser, rolcanlogin AS can_login,
        rolconnlimit AS connection_limit
      FROM pg_roles ORDER BY rolname
    `,
    );

    const keySettingNames = [
      'shared_buffers',
      'effective_cache_size',
      'work_mem',
      'maintenance_work_mem',
      'max_connections',
      'random_page_cost',
      'checkpoint_completion_target',
    ];
    const keySettingRows = await this.poolManager.query<{
      name: string;
      setting: string;
      unit: string;
    }>(
      targetId,
      `SELECT name, setting, unit FROM pg_settings WHERE name = ANY($1)`,
      [keySettingNames],
    );
    const keySettings: Record<string, string> = {};
    for (const r of keySettingRows)
      keySettings[r.name] = `${r.setting}${r.unit ?? ''}`;

    const configIssues: Array<{
      setting: string;
      current: string;
      recommended: string;
      reason: string;
      severity: string;
    }> = [];
    const sharedBuffers = keySettingRows.find(
      (r) => r.name === 'shared_buffers',
    );
    if (sharedBuffers && Number(sharedBuffers.setting) < 16384) {
      configIssues.push({
        setting: 'shared_buffers',
        current: keySettings['shared_buffers'] ?? '',
        recommended: '25% of RAM',
        reason:
          'shared_buffers is very low — this significantly hurts cache hit ratio',
        severity: 'warning',
      });
    }

    return {
      server: {
        version: String(s.version).split(' ')[1] ?? String(s.version),
        majorVersion: parseInt(
          String(s.version).split(' ')[1]?.split('.')[0] ?? '0',
          10,
        ),
        dataDirectory: String(s.data_directory),
        timezone: String(s.timezone),
        serverEncoding: String(s.server_encoding),
        maxConnections: Number(s.max_connections),
        uptimeHours: Number(s.uptime_hours) || 0,
        postmasterStartTime: s.postmaster_start_time,
      },
      databases: dbRows.map((r) => ({
        name: String(r.name),
        owner: String(r.owner),
        sizeBytes: Number(r.size_bytes) || 0,
        sizeHuman: String(r.size_human),
        ageXid: Number(r.age_xid) || 0,
        connections: Number(r.connections) || 0,
        isTemplate: Boolean(r.is_template),
      })),
      extensions: extRows.map((r) => ({
        name: String(r.name),
        version: String(r.version),
        schemaName: String(r.schema_name),
        comment: r.comment ? String(r.comment) : null,
      })),
      roles: roleRows.map((r) => ({
        name: String(r.name),
        isSuperuser: Boolean(r.is_superuser),
        canLogin: Boolean(r.can_login),
        connectionLimit: Number(r.connection_limit) || -1,
      })),
      keySettings,
      totalDatabaseSize: dbRows.reduce(
        (sum, r) => sum + (Number(r.size_bytes) || 0),
        0,
      ),
      configIssues,
    };
  }

  async getSettings(targetId: string, search?: string) {
    const rows = await this.poolManager.query<Record<string, unknown>>(
      targetId,
      `
      SELECT name, setting, unit, category, short_desc, context, source, vartype,
        pending_restart AS is_pending_restart
      FROM pg_settings
      WHERE ($1::text IS NULL OR name ILIKE '%' || $1 || '%' OR short_desc ILIKE '%' || $1 || '%')
      ORDER BY category, name
    `,
      [search ?? null],
    );

    const settings = rows.map((r) => ({
      name: String(r.name),
      setting: String(r.setting),
      unit: r.unit ? String(r.unit) : null,
      category: String(r.category),
      shortDesc: String(r.short_desc ?? ''),
      context: String(r.context),
      source: String(r.source),
      vartype: String(r.vartype),
      isPendingRestart: Boolean(r.is_pending_restart),
    }));

    return { settings };
  }

  async getDiagnostics(targetId: string): Promise<DiagnosticsReport> {
    const checks: DiagnosticCheck[] = [];

    checks.push(
      await this.runCheck({
        id: 'connectivity',
        title: "Ma'lumotlar bazasiga ulanish",
        affects: 'Barcha sahifalar',
        run: async () => {
          await this.poolManager.query(targetId, 'SELECT 1');
        },
        severity: 'error',
        fixTitle: 'Host, port, foydalanuvchi nomi va parolni tekshiring',
        fixCommand: null,
        explain: "PostgreSQL serveriga umuman ulanib bo'lmayapti.",
      }),
    );

    if (checks[0].status === 'error') {
      return this.buildReport(targetId, checks);
    }

    checks.push(
      await this.runCheck({
        id: 'version',
        title: 'PostgreSQL versiyasi',
        affects: 'Vacuum sahifasi (progress monitoring)',
        run: async () => {
          const rows = await this.poolManager.query<{
            server_version_num: string;
          }>(targetId, `SHOW server_version_num`);

          const versionNum = parseInt(rows[0]?.server_version_num ?? '0', 10);
          if (versionNum < 130000) {
            throw new Error(
              `PostgreSQL versiyasi juda eski (${versionNum}) — 13+ tavsiya etiladi`,
            );
          }
        },
        severity: 'warning',
        fixTitle: "PostgreSQL 13 yoki undan yangi versiyaga o'ting",
        fixCommand: null,
        explain:
          "pg_stat_progress_vacuum kabi ba'zi tizim view'lari faqat PostgreSQL 13+ da mavjud. Eski versiyada Vacuum sahifasining \"Running vacuums\" bo'limi bo'sh chiqadi.",
      }),
    );

    checks.push(
      await this.runCheck({
        id: 'pg_stat_activity',
        title: 'Session monitoring ruxsati',
        affects: 'Dashboard, Connections sahifalari',
        run: async () => {
          await this.poolManager.query(
            targetId,
            'SELECT 1 FROM pg_stat_activity LIMIT 1',
          );
        },
        severity: 'error',
        fixTitle: 'Monitoring foydalanuvchisiga pg_monitor rolini bering',
        fixCommand: this.grantMonitorCommand(targetId),
        explain:
          "Ulangan foydalanuvchida faol session'larni ko'rish uchun yetarli ruxsat yo'q.",
      }),
    );

    checks.push(
      await this.runCheck({
        id: 'pg_locks',
        title: 'Lock monitoring ruxsati',
        affects: 'Locks sahifasi',
        run: async () => {
          await this.poolManager.query(
            targetId,
            'SELECT 1 FROM pg_locks LIMIT 1',
          );
        },
        severity: 'error',
        fixTitle: 'Monitoring foydalanuvchisiga pg_monitor rolini bering',
        fixCommand: this.grantMonitorCommand(targetId),
        explain:
          "Ulangan foydalanuvchida lock holatini ko'rish uchun yetarli ruxsat yo'q.",
      }),
    );

    checks.push(
      await this.runCheck({
        id: 'pg_stat_user_tables',
        title: 'Jadval statistikasi ruxsati',
        affects: 'Tables & Indexes sahifasi',
        run: async () => {
          await this.poolManager.query(
            targetId,
            'SELECT 1 FROM pg_stat_user_tables LIMIT 1',
          );
        },
        severity: 'error',
        fixTitle: 'Monitoring foydalanuvchisiga pg_monitor rolini bering',
        fixCommand: this.grantMonitorCommand(targetId),
        explain:
          "Ulangan foydalanuvchida jadval statistikasini ko'rish uchun yetarli ruxsat yo'q.",
      }),
    );

    checks.push(
      await this.runCheck({
        id: 'pg_stat_statements',
        title: "So'rov statistikasi extension'i",
        affects: 'Queries sahifasi',
        run: async () => {
          const rows = await this.poolManager.query<{ exists: boolean }>(
            targetId,
            `
          SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') AS exists
        `,
          );
          if (!rows[0]?.exists)
            throw new Error("pg_stat_statements extension o'rnatilmagan");
        },
        severity: 'warning',
        fixTitle: "pg_stat_statements extension'ini yoqing",
        fixCommand: 'CREATE EXTENSION IF NOT EXISTS pg_stat_statements;',
        explain:
          "Bu extension bo'lmasa, Queries sahifasida sekin so'rovlar ro'yxati ko'rsatilmaydi. Extension yaratishdan oldin postgresql.conf faylida shared_preload_libraries = 'pg_stat_statements' qo'shib, serverni qayta ishga tushirish kerak bo'lishi mumkin.",
      }),
    );

    checks.push(
      await this.runCheck({
        id: 'pg_stat_replication',
        title: 'Replikatsiya monitoring ruxsati',
        affects: 'Replication sahifasi',
        run: async () => {
          await this.poolManager.query(
            targetId,
            'SELECT 1 FROM pg_stat_replication LIMIT 1',
          );
        },
        severity: 'warning',
        fixTitle: 'Monitoring foydalanuvchisiga pg_monitor rolini bering',
        fixCommand: this.grantMonitorCommand(targetId),
        explain:
          "Ba'zi boshqariluvchi PostgreSQL provayderlari (masalan RDS) bu view'ga cheklov qo'yishi mumkin — bu holatda Replication sahifasi cheklangan ma'lumot ko'rsatadi, lekin ilova ishlashda davom etadi.",
      }),
    );

    checks.push(
      await this.runCheck({
        id: 'pg_settings',
        title: "Server sozlamalarini o'qish ruxsati",
        affects: 'Settings sahifasi',
        run: async () => {
          await this.poolManager.query(
            targetId,
            'SELECT 1 FROM pg_settings LIMIT 1',
          );
        },
        severity: 'warning',
        fixTitle: 'Monitoring foydalanuvchisiga pg_monitor rolini bering',
        fixCommand: this.grantMonitorCommand(targetId),
        explain:
          "Server konfiguratsiyasini o'qib bo'lmayapti — bu juda kam uchraydigan holat.",
      }),
    );

    return this.buildReport(targetId, checks);
  }

  private grantMonitorCommand(targetId: string): string {
    const entry = this.poolManager.getEntry(targetId);
    const username = entry?.username ?? 'your_monitoring_user';
    return `GRANT pg_monitor TO ${username};`;
  }

  private async runCheck(opts: {
    id: string;
    title: string;
    affects: string;
    run: () => Promise<void>;
    severity: 'error' | 'warning';
    fixTitle: string;
    fixCommand: string | null;
    explain: string;
  }): Promise<DiagnosticCheck> {
    try {
      await opts.run();
      return {
        id: opts.id,
        title: opts.title,
        affects: opts.affects,
        status: 'ok',
        message: 'OK',
        fixTitle: null,
        fixCommand: null,
      };
    } catch (error) {
      return {
        id: opts.id,
        title: opts.title,
        affects: opts.affects,
        status: opts.severity,
        message: opts.explain,
        detail: (error as Error).message,
        fixTitle: opts.fixTitle,
        fixCommand: opts.fixCommand,
      };
    }
  }

  private buildReport(
    targetId: string,
    checks: DiagnosticCheck[],
  ): DiagnosticsReport {
    const entry = this.poolManager.getEntry(targetId);
    const hasError = checks.some((c) => c.status === 'error');
    const hasWarning = checks.some((c) => c.status === 'warning');

    return {
      targetId,
      checkedAt: new Date().toISOString(),
      pgVersion: entry?.pgVersion ?? null,
      overallStatus: hasError ? 'broken' : hasWarning ? 'degraded' : 'healthy',
      checks,
    };
  }

  async getDatabaseStats(targetId: string): Promise<DatabaseStatsSnapshot> {
    const rows = await this.poolManager.query<Record<string, unknown>>(
      targetId,
      `
      SELECT
        d.datname AS name,
        s.numbackends AS num_backends,
        s.xact_commit, s.xact_rollback,
        s.blks_read, s.blks_hit,
        s.tup_returned, s.tup_fetched, s.tup_inserted, s.tup_updated, s.tup_deleted,
        s.conflicts, s.temp_files, s.temp_bytes, s.deadlocks,
        s.checksum_failures,
        s.blk_read_time, s.blk_write_time,
        s.stats_reset
      FROM pg_stat_database s
      JOIN pg_database d ON d.oid = s.datid
      WHERE NOT d.datistemplate AND d.datname IS NOT NULL
      ORDER BY (s.blks_hit + s.blks_read) DESC
    `,
    );

    const trackIoTimingRows = await this.poolManager.query<{ setting: string }>(
      targetId,
      `SELECT setting FROM pg_settings WHERE name = 'track_io_timing'`,
    );
    const trackIoTimingEnabled = trackIoTimingRows[0]?.setting === 'on';

    const databases = rows.map((r) => {
      const blksRead = Number(r.blks_read) || 0;
      const blksHit = Number(r.blks_hit) || 0;
      const xactCommit = Number(r.xact_commit) || 0;
      const xactRollback = Number(r.xact_rollback) || 0;
      const totalBlks = blksRead + blksHit;
      const totalXact = xactCommit + xactRollback;

      return {
        name: String(r.name),
        numBackends: Number(r.num_backends) || 0,
        xactCommit,
        xactRollback,
        commitRatio: totalXact > 0 ? xactCommit / totalXact : 1,
        blksRead,
        blksHit,
        cacheHitRatio: totalBlks > 0 ? blksHit / totalBlks : 1,
        tupReturned: Number(r.tup_returned) || 0,
        tupFetched: Number(r.tup_fetched) || 0,
        tupInserted: Number(r.tup_inserted) || 0,
        tupUpdated: Number(r.tup_updated) || 0,
        tupDeleted: Number(r.tup_deleted) || 0,
        conflicts: Number(r.conflicts) || 0,
        tempFiles: Number(r.temp_files) || 0,
        tempBytes: Number(r.temp_bytes) || 0,
        deadlocks: Number(r.deadlocks) || 0,
        checksumFailures: Number(r.checksum_failures) || 0,
        blkReadTimeMs: Number(r.blk_read_time) || 0,
        blkWriteTimeMs: Number(r.blk_write_time) || 0,
        statsReset: r.stats_reset ? String(r.stats_reset) : null,
      };
    });

    return { databases, trackIoTimingEnabled };
  }

  async getIoStats(targetId: string): Promise<IoStatsSnapshot> {
    const entry = this.poolManager.getEntry(targetId);
    const pgVersionNum = entry?.pgVersionNum ?? 0;

    const trackIoTimingRows = await this.poolManager.query<{ setting: string }>(
      targetId,
      `SELECT setting FROM pg_settings WHERE name = 'track_io_timing'`,
    );
    const trackIoTimingEnabled = trackIoTimingRows[0]?.setting === 'on';

    if (pgVersionNum >= 160000) {
      try {
        const rows = await this.poolManager.query<Record<string, unknown>>(
          targetId,
          `
          SELECT backend_type, object, context,
            reads, writes, extends, hits, evictions, reuses, fsyncs,
            read_time, write_time, extend_time, fsync_time
          FROM pg_stat_io
          WHERE reads > 0 OR writes > 0 OR extends > 0 OR hits > 0
          ORDER BY reads DESC, writes DESC
        `,
        );

        const ioRows: IoStatRow[] = rows.map((r) => ({
          backendType: String(r.backend_type),
          object: String(r.object),
          context: String(r.context),
          reads: Number(r.reads) || 0,
          writes: Number(r.writes) || 0,
          extends: Number(r.extends) || 0,
          hits: Number(r.hits) || 0,
          evictions: Number(r.evictions) || 0,
          reuses: Number(r.reuses) || 0,
          fsyncs: Number(r.fsyncs) || 0,
          readTimeMs: Number(r.read_time) || 0,
          writeTimeMs: Number(r.write_time) || 0,
          extendTimeMs: Number(r.extend_time) || 0,
          fsyncTimeMs: Number(r.fsync_time) || 0,
        }));

        const byBackendMap = new Map<
          string,
          { reads: number; writes: number; extends: number }
        >();
        for (const row of ioRows) {
          const acc = byBackendMap.get(row.backendType) ?? {
            reads: 0,
            writes: 0,
            extends: 0,
          };
          acc.reads += row.reads;
          acc.writes += row.writes;
          acc.extends += row.extends;
          byBackendMap.set(row.backendType, acc);
        }
        const byBackendType = Array.from(
          byBackendMap,
          ([backendType, stats]) => ({ backendType, ...stats }),
        ).sort((a, b) => b.reads + b.writes - (a.reads + a.writes));

        return {
          source: 'pg_stat_io',
          pgStatIoAvailable: true,
          trackIoTimingEnabled,
          rows: ioRows,
          byBackendType,
        };
      } catch {}
    }

    const fallbackRows = await this.poolManager.query<Record<string, unknown>>(
      targetId,
      `
      SELECT
        COALESCE(SUM(heap_blks_read), 0)  AS heap_blks_read,
        COALESCE(SUM(heap_blks_hit), 0)   AS heap_blks_hit,
        COALESCE(SUM(idx_blks_read), 0)   AS idx_blks_read,
        COALESCE(SUM(idx_blks_hit), 0)    AS idx_blks_hit,
        COALESCE(SUM(toast_blks_read), 0) AS toast_blks_read,
        COALESCE(SUM(toast_blks_hit), 0)  AS toast_blks_hit
      FROM pg_statio_user_tables
    `,
    );
    const f = fallbackRows[0] ?? {};
    const heapRead = Number(f.heap_blks_read) || 0;
    const heapHit = Number(f.heap_blks_hit) || 0;
    const idxRead = Number(f.idx_blks_read) || 0;
    const idxHit = Number(f.idx_blks_hit) || 0;
    const totalRead = heapRead + idxRead;
    const totalHit = heapHit + idxHit;

    return {
      source: 'pg_statio_fallback',
      pgStatIoAvailable: false,
      trackIoTimingEnabled,
      fallback: {
        heapBlksRead: heapRead,
        heapBlksHit: heapHit,
        idxBlksRead: idxRead,
        idxBlksHit: idxHit,
        toastBlksRead: Number(f.toast_blks_read) || 0,
        toastBlksHit: Number(f.toast_blks_hit) || 0,
        cacheHitRatio:
          totalRead + totalHit > 0 ? totalHit / (totalRead + totalHit) : 1,
      },
    };
  }

  async getJobProgress(targetId: string): Promise<JobProgressSnapshot> {
    const [createIndex, cluster, analyze, copy] = await Promise.all([
      this.safeProgressQuery(
        targetId,
        `
        SELECT p.pid, c.relname AS table_name, n.nspname AS schema_name,
          p.command, p.phase,
          p.blocks_total, p.blocks_done,
          p.tuples_total, p.tuples_done
        FROM pg_stat_progress_create_index p
        JOIN pg_class c ON c.oid = p.relid
        JOIN pg_namespace n ON n.oid = c.relnamespace
      `,
        (r) => ({
          pid: Number(r.pid),
          tableName: String(r.table_name),
          schemaName: String(r.schema_name),
          command: String(r.command),
          phase: String(r.phase),
          blocksTotal: Number(r.blocks_total) || 0,
          blocksDone: Number(r.blocks_done) || 0,
          tuplesTotal: Number(r.tuples_total) || 0,
          tuplesDone: Number(r.tuples_done) || 0,
          progressPct:
            Number(r.blocks_total) > 0
              ? (Number(r.blocks_done) / Number(r.blocks_total)) * 100
              : 0,
        }),
      ),

      this.safeProgressQuery(
        targetId,
        `
        SELECT p.pid, c.relname AS table_name, n.nspname AS schema_name,
          p.command, p.phase,
          p.heap_tuples_scanned, p.heap_tuples_written,
          p.heap_blks_total, p.heap_blks_scanned
        FROM pg_stat_progress_cluster p
        JOIN pg_class c ON c.oid = p.relid
        JOIN pg_namespace n ON n.oid = c.relnamespace
      `,
        (r) => ({
          pid: Number(r.pid),
          tableName: String(r.table_name),
          schemaName: String(r.schema_name),
          command: String(r.command),
          phase: String(r.phase),
          heapTuplesScanned: Number(r.heap_tuples_scanned) || 0,
          heapTuplesWritten: Number(r.heap_tuples_written) || 0,
          heapBlksTotal: Number(r.heap_blks_total) || 0,
          heapBlksScanned: Number(r.heap_blks_scanned) || 0,
          progressPct:
            Number(r.heap_blks_total) > 0
              ? (Number(r.heap_blks_scanned) / Number(r.heap_blks_total)) * 100
              : 0,
        }),
      ),

      this.safeProgressQuery(
        targetId,
        `
        SELECT p.pid, c.relname AS table_name, n.nspname AS schema_name,
          p.phase,
          p.sample_blks_total, p.sample_blks_scanned,
          p.child_tables_total, p.child_tables_done
        FROM pg_stat_progress_analyze p
        JOIN pg_class c ON c.oid = p.relid
        JOIN pg_namespace n ON n.oid = c.relnamespace
      `,
        (r) => ({
          pid: Number(r.pid),
          tableName: String(r.table_name),
          schemaName: String(r.schema_name),
          phase: String(r.phase),
          sampleBlksTotal: Number(r.sample_blks_total) || 0,
          sampleBlksScanned: Number(r.sample_blks_scanned) || 0,
          childTablesTotal: Number(r.child_tables_total) || 0,
          childTablesDone: Number(r.child_tables_done) || 0,
          progressPct:
            Number(r.sample_blks_total) > 0
              ? (Number(r.sample_blks_scanned) / Number(r.sample_blks_total)) *
                100
              : 0,
        }),
      ),

      this.safeProgressQuery(
        targetId,
        `
        SELECT p.pid, c.relname AS table_name, n.nspname AS schema_name,
          p.command, p.type,
          p.bytes_processed, p.bytes_total,
          p.tuples_processed, p.tuples_excluded
        FROM pg_stat_progress_copy p
        LEFT JOIN pg_class c ON c.oid = p.relid
        LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
      `,
        (r) => ({
          pid: Number(r.pid),
          tableName: r.table_name ? String(r.table_name) : null,
          schemaName: r.schema_name ? String(r.schema_name) : null,
          command: String(r.command),
          type: String(r.type),
          bytesProcessed: Number(r.bytes_processed) || 0,
          bytesTotal: Number(r.bytes_total) || 0,
          tuplesProcessed: Number(r.tuples_processed) || 0,
          tuplesExcluded: Number(r.tuples_excluded) || 0,
          progressPct:
            Number(r.bytes_total) > 0
              ? (Number(r.bytes_processed) / Number(r.bytes_total)) * 100
              : 0,
        }),
      ),
    ]);

    return {
      createIndex,
      cluster,
      analyze,
      copy,
      totalActive:
        createIndex.length + cluster.length + analyze.length + copy.length,
    };
  }

  private async safeProgressQuery<T>(
    targetId: string,
    sql: string,
    mapRow: (r: Record<string, unknown>) => T,
  ): Promise<T[]> {
    try {
      const rows = await this.poolManager.query<Record<string, unknown>>(
        targetId,
        sql,
      );
      return rows.map(mapRow);
    } catch {
      return [];
    }
  }

  async getHealthScore(targetId: string): Promise<HealthScoreReport> {
    const [vacuum, tables, database, replication, connections] =
      await Promise.all([
        this.getVacuumProgress(targetId).catch(() => null),
        this.getTableStats(targetId).catch(() => null),
        this.getDatabaseStats(targetId).catch(() => null),
        this.getReplication(targetId).catch(() => null),
        this.getConnections(targetId).catch(() => null),
      ]);

    const factors: HealthFactor[] = [];
    let score = 100;

    if (vacuum) {
      const xidParams = {
        xid: vacuum.maxXidAge,
        mxid: vacuum.maxMxidAge,
      };
      const worstAge = Math.max(vacuum.maxXidAge, vacuum.maxMxidAge);
      if (worstAge >= 1_500_000_000) {
        score -= 25;
        factors.push({
          id: 'xid_age',
          label: 'XID wraparound xavfi',
          status: 'critical',
          impact: -25,
          detail: `Max XID yoshi: ${vacuum.maxXidAge.toLocaleString()} — favqulodda VACUUM FREEZE kerak`,
          code: 'emergency',
          params: xidParams,
        });
      } else if (vacuum.hasXidRisk || vacuum.hasMxidRisk) {
        score -= 12;
        factors.push({
          id: 'xid_age',
          label: 'XID wraparound xavfi',
          status: 'warning',
          impact: -12,
          detail: `Max XID yoshi: ${vacuum.maxXidAge.toLocaleString()}`,
          code: 'risk',
          params: xidParams,
        });
      } else {
        factors.push({
          id: 'xid_age',
          label: 'XID wraparound xavfi',
          status: 'ok',
          impact: 0,
          code: 'ok',
          params: xidParams,
        });
      }
    }

    if (tables) {
      const maxBloat = Math.max(0, ...tables.tables.map((t) => t.bloatRatio));
      if (maxBloat >= 0.4) {
        score -= 15;
        factors.push({
          id: 'bloat',
          label: 'Jadval bloat',
          status: 'critical',
          impact: -15,
          detail: `Eng yuqori bloat: ${(maxBloat * 100).toFixed(0)}% (${tables.tablesNeedingVacuum} ta jadval VACUUM kutmoqda)`,
          code: 'high',
          params: {
            pct: Math.round(maxBloat * 100),
            count: tables.tablesNeedingVacuum,
          },
        });
      } else if (tables.tablesNeedingVacuum > 0) {
        score -= 6;
        factors.push({
          id: 'bloat',
          label: 'Jadval bloat',
          status: 'warning',
          impact: -6,
          detail: `${tables.tablesNeedingVacuum} ta jadval VACUUM kutmoqda`,
          code: 'pending',
          params: { count: tables.tablesNeedingVacuum },
        });
      } else {
        factors.push({
          id: 'bloat',
          label: 'Jadval bloat',
          status: 'ok',
          impact: 0,
        });
      }
    }

    if (database && database.databases.length > 0) {
      const avgHit =
        database.databases.reduce((s, d) => s + d.cacheHitRatio, 0) /
        database.databases.length;
      if (avgHit < 0.9) {
        score -= 15;
        factors.push({
          id: 'cache_hit',
          label: 'Buffer cache hit ratio',
          status: 'critical',
          impact: -15,
          detail: `O'rtacha: ${(avgHit * 100).toFixed(1)}% — shared_buffers yetarli emasligini bildirishi mumkin`,
          code: 'low',
          params: { pct: (avgHit * 100).toFixed(1) },
        });
      } else if (avgHit < 0.98) {
        score -= 5;
        factors.push({
          id: 'cache_hit',
          label: 'Buffer cache hit ratio',
          status: 'warning',
          impact: -5,
          detail: `O'rtacha: ${(avgHit * 100).toFixed(1)}%`,
          code: 'warn',
          params: { pct: (avgHit * 100).toFixed(1) },
        });
      } else {
        factors.push({
          id: 'cache_hit',
          label: 'Buffer cache hit ratio',
          status: 'ok',
          impact: 0,
        });
      }
    }

    if (replication && replication.hasReplicas) {
      if (replication.hasLaggedReplicas) {
        score -= 10;
        factors.push({
          id: 'replication_lag',
          label: 'Replikatsiya lag',
          status: 'warning',
          impact: -10,
          detail: `Maksimal lag: ${(replication.maxLagBytes / 1024 / 1024).toFixed(1)} MB`,
          code: 'lagging',
          params: { mb: (replication.maxLagBytes / 1024 / 1024).toFixed(1) },
        });
      } else {
        factors.push({
          id: 'replication_lag',
          label: 'Replikatsiya lag',
          status: 'ok',
          impact: 0,
        });
      }
    }

    if (replication) {
      for (const factor of replicationHealthFactors(replication)) {
        score += factor.impact;
        factors.push(factor);
      }
    }

    if (connections) {
      if (connections.connectionUsagePct >= 90) {
        score -= 15;
        factors.push({
          id: 'connection_pool',
          label: 'Connection pool holati',
          status: 'critical',
          impact: -15,
          detail: `${connections.connectionUsagePct.toFixed(0)}% band — yangi ulanishlar rad etilishi mumkin`,
          code: 'full',
          params: { pct: Math.round(connections.connectionUsagePct) },
        });
      } else if (connections.connectionUsagePct >= 75) {
        score -= 5;
        factors.push({
          id: 'connection_pool',
          label: 'Connection pool holati',
          status: 'warning',
          impact: -5,
          detail: `${connections.connectionUsagePct.toFixed(0)}% band`,
          code: 'high',
          params: { pct: Math.round(connections.connectionUsagePct) },
        });
      } else {
        factors.push({
          id: 'connection_pool',
          label: 'Connection pool holati',
          status: 'ok',
          impact: 0,
        });
      }
    }

    try {
      const latestBackup = await this.latestCompletedBackup(targetId);
      if (!latestBackup) {
        score -= 15;
        factors.push({
          id: 'backup_freshness',
          label: 'Backup yangiligi',
          status: 'warning',
          impact: -15,
          detail: 'Hech qachon muvaffaqiyatli backup olinmagan',
          code: 'never',
        });
      } else {
        const ageHours =
          (Date.now() - latestBackup.completedAt.getTime()) / 3_600_000;
        if (ageHours > 7 * 24) {
          score -= 10;
          factors.push({
            id: 'backup_freshness',
            label: 'Backup yangiligi',
            status: 'warning',
            impact: -10,
            detail: `Oxirgi backup ${Math.floor(ageHours / 24)} kun oldin`,
            code: 'days',
            params: { days: Math.floor(ageHours / 24) },
          });
        } else if (ageHours > 24) {
          score -= 3;
          factors.push({
            id: 'backup_freshness',
            label: 'Backup yangiligi',
            status: 'info',
            impact: -3,
            detail: `Oxirgi backup ${Math.floor(ageHours)} soat oldin`,
            code: 'hours',
            params: { hours: Math.floor(ageHours) },
          });
        } else {
          factors.push({
            id: 'backup_freshness',
            label: 'Backup yangiligi',
            status: 'ok',
            impact: 0,
            detail: `Oxirgi backup ${Math.floor(ageHours)} soat oldin`,
            code: 'hours',
            params: { hours: Math.floor(ageHours) },
          });
        }
      }
    } catch (err) {
      this.logger.warn(
        `Health score: backup freshness check failed: ${(err as Error).message}`,
      );
    }

    score = Math.max(0, Math.min(100, score));
    const grade: HealthScoreReport['grade'] =
      score >= 90
        ? 'excellent'
        : score >= 70
          ? 'good'
          : score >= 50
            ? 'fair'
            : 'poor';

    return {
      targetId,
      checkedAt: new Date().toISOString(),
      score,
      grade,
      factors,
    };
  }

  private async latestCompletedBackup(
    targetId: string,
  ): Promise<{ completedAt: Date } | null> {
    const db = this.prisma as unknown as Record<string, unknown>;
    const backupModel = db['backup'] as {
      findFirst: (args: unknown) => Promise<{ completedAt: Date } | null>;
    };
    return backupModel.findFirst({
      where: { targetId, status: 'completed' },
      orderBy: { completedAt: 'desc' },
      select: { completedAt: true },
    });
  }
}

export interface DiagnosticCheck {
  id: string;
  title: string;
  affects: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  detail?: string;
  fixTitle: string | null;
  fixCommand: string | null;
}

export interface DiagnosticsReport {
  targetId: string;
  checkedAt: string;
  pgVersion: string | null;
  overallStatus: 'healthy' | 'degraded' | 'broken';
  checks: DiagnosticCheck[];
}

export interface DatabaseStat {
  name: string;
  numBackends: number;
  xactCommit: number;
  xactRollback: number;
  commitRatio: number;
  blksRead: number;
  blksHit: number;
  cacheHitRatio: number;
  tupReturned: number;
  tupFetched: number;
  tupInserted: number;
  tupUpdated: number;
  tupDeleted: number;
  conflicts: number;
  tempFiles: number;
  tempBytes: number;
  deadlocks: number;
  checksumFailures: number;
  blkReadTimeMs: number;
  blkWriteTimeMs: number;
  statsReset: string | null;
}

export interface DatabaseStatsSnapshot {
  databases: DatabaseStat[];
  trackIoTimingEnabled: boolean;
}

export interface IoStatRow {
  backendType: string;
  object: string;
  context: string;
  reads: number;
  writes: number;
  extends: number;
  hits: number;
  evictions: number;
  reuses: number;
  fsyncs: number;
  readTimeMs: number;
  writeTimeMs: number;
  extendTimeMs: number;
  fsyncTimeMs: number;
}

export interface IoStatsSnapshot {
  source: 'pg_stat_io' | 'pg_statio_fallback';
  pgStatIoAvailable: boolean;
  trackIoTimingEnabled: boolean;
  rows?: IoStatRow[];
  byBackendType?: Array<{
    backendType: string;
    reads: number;
    writes: number;
    extends: number;
  }>;
  fallback?: {
    heapBlksRead: number;
    heapBlksHit: number;
    idxBlksRead: number;
    idxBlksHit: number;
    toastBlksRead: number;
    toastBlksHit: number;
    cacheHitRatio: number;
  };
}

export interface CreateIndexProgress {
  pid: number;
  tableName: string;
  schemaName: string;
  command: string;
  phase: string;
  blocksTotal: number;
  blocksDone: number;
  tuplesTotal: number;
  tuplesDone: number;
  progressPct: number;
}

export interface ClusterProgress {
  pid: number;
  tableName: string;
  schemaName: string;
  command: string;
  phase: string;
  heapTuplesScanned: number;
  heapTuplesWritten: number;
  heapBlksTotal: number;
  heapBlksScanned: number;
  progressPct: number;
}

export interface AnalyzeProgress {
  pid: number;
  tableName: string;
  schemaName: string;
  phase: string;
  sampleBlksTotal: number;
  sampleBlksScanned: number;
  childTablesTotal: number;
  childTablesDone: number;
  progressPct: number;
}

export interface CopyProgress {
  pid: number;
  tableName: string | null;
  schemaName: string | null;
  command: string;
  type: string;
  bytesProcessed: number;
  bytesTotal: number;
  tuplesProcessed: number;
  tuplesExcluded: number;
  progressPct: number;
}

export interface JobProgressSnapshot {
  createIndex: CreateIndexProgress[];
  cluster: ClusterProgress[];
  analyze: AnalyzeProgress[];
  copy: CopyProgress[];
  totalActive: number;
}

export interface HealthFactor {
  id: string;
  label: string;
  status: 'ok' | 'info' | 'warning' | 'critical';
  impact: number;
  detail?: string;
  code?: string;
  params?: Record<string, string | number>;
}

export interface HealthScoreReport {
  targetId: string;
  checkedAt: string;
  score: number;
  grade: 'excellent' | 'good' | 'fair' | 'poor';
  factors: HealthFactor[];
}

export interface ArchiverStatus {
  mode: string;
  enabled: boolean;
  archivedCount: number;
  lastArchivedWal: string | null;
  lastArchivedTime: string | null;
  lastArchivedAgeSec: number | null;
  failedCount: number;
  lastFailedWal: string | null;
  lastFailedTime: string | null;
  readyCount: number | null;
  failing: boolean;
}

export interface TableBloatEntry {
  schemaName: string;
  tableName: string;
  tableBytes: number;
  wastedBytes: number;
  wastedPct: number;
  deadTuplePct: number;
  freePct: number | null;
  scannedPct: number | null;
  method: 'pgstattuple_approx' | 'dead_tuples' | 'skipped_large' | 'failed';
}

export interface TableBloatReport {
  method: 'pgstattuple_approx' | 'dead_tuples';
  extensionInstalled: boolean;
  canExecute: boolean;
  installCommand: string;
  grantCommand: string | null;
  measuredAt: string;
  durationMs: number;
  tables: TableBloatEntry[];
}

type ReplicationReport = Awaited<
  ReturnType<LiveQueryService['getReplication']>
>;

const REPLAY_GAP_WARNING_BYTES = 64 * 1024 * 1024;
const ARCHIVE_READY_WARNING = 20;

export function replicationHealthFactors(
  replication: ReplicationReport,
): HealthFactor[] {
  const factors: HealthFactor[] = [];
  const sync = replication.synchronous;
  if (sync) {
    factors.push(
      sync.satisfied
        ? {
            id: 'sync_quorum',
            label: 'Sinxron standby kvorumi',
            status: 'ok',
            impact: 0,
            code: 'ok',
            params: { healthy: sync.healthy, required: sync.required },
          }
        : {
            id: 'sync_quorum',
            label: 'Sinxron standby kvorumi',
            status: 'critical',
            impact: -20,
            detail: `${sync.required} ta sinxron standby kerak, ishlayotgani ${sync.healthy} ta — commit'lar kutib qoladi`,
            code: 'unsatisfied',
            params: {
              healthy: sync.healthy,
              required: sync.required,
              names: sync.standbyNames,
            },
          },
    );
  }

  if (replication.slots.length > 0) {
    const lost = replication.slots.find((s) => s.walStatus === 'lost');
    const retaining = replication.slots
      .filter((s) => !s.active && s.isBlocking)
      .sort((a, b) => b.walBytes - a.walBytes)[0];
    if (lost) {
      factors.push({
        id: 'replication_slots',
        label: 'Replication slot',
        status: 'critical',
        impact: -15,
        detail: `${lost.slotName} slot'i kerakli WAL'ni yo'qotgan — standby qayta qurilishi kerak`,
        code: 'lost',
        params: { slot: lost.slotName },
      });
    } else if (retaining) {
      factors.push({
        id: 'replication_slots',
        label: 'Replication slot',
        status: 'warning',
        impact: -10,
        detail: `Faol bo'lmagan ${retaining.slotName} slot'i ${(retaining.walBytes / 1024 / 1024).toFixed(0)} MB WAL ushlab turibdi`,
        code: 'retaining',
        params: {
          slot: retaining.slotName,
          mb: Math.round(retaining.walBytes / 1024 / 1024),
        },
      });
    } else {
      factors.push({
        id: 'replication_slots',
        label: 'Replication slot',
        status: 'ok',
        impact: 0,
        code: 'ok',
        params: { count: replication.slots.length },
      });
    }
  }

  if (!replication.isPrimary) {
    const receiver = replication.receiverInfo;
    const standby = replication.standby;
    if (!receiver || receiver.status !== 'streaming') {
      factors.push({
        id: 'standby_replay',
        label: 'Standby replikatsiyasi',
        status: 'warning',
        impact: -10,
        detail: `WAL receiver holati: ${receiver?.status ?? "yo'q"}`,
        code: 'receiverDown',
        params: { status: receiver?.status ?? '-' },
      });
    } else if (standby?.paused) {
      factors.push({
        id: 'standby_replay',
        label: 'Standby replikatsiyasi',
        status: 'warning',
        impact: -5,
        detail: 'WAL replay pauza qilingan',
        code: 'paused',
      });
    } else if (standby && standby.replayGapBytes > REPLAY_GAP_WARNING_BYTES) {
      factors.push({
        id: 'standby_replay',
        label: 'Standby replikatsiyasi',
        status: 'warning',
        impact: -5,
        detail: `Qabul qilingan, lekin qo'llanmagan WAL: ${(standby.replayGapBytes / 1024 / 1024).toFixed(0)} MB`,
        code: 'replayBehind',
        params: { mb: Math.round(standby.replayGapBytes / 1024 / 1024) },
      });
    } else {
      factors.push({
        id: 'standby_replay',
        label: 'Standby replikatsiyasi',
        status: 'ok',
        impact: 0,
        code: 'streaming',
        params: { host: receiver.senderHost ?? '-' },
      });
    }
  }

  const archiver = replication.archiver;
  if (archiver.enabled) {
    if (archiver.failing) {
      factors.push({
        id: 'wal_archiving',
        label: 'WAL arxivlash',
        status: 'critical',
        impact: -15,
        detail: `archive_command ishlamayapti: oxirgi xato ${archiver.lastFailedWal ?? '-'} — PITR zanjiri uzilgan`,
        code: 'failing',
        params: {
          wal: archiver.lastFailedWal ?? '-',
          failed: archiver.failedCount,
        },
      });
    } else if (
      archiver.readyCount !== null &&
      archiver.readyCount > ARCHIVE_READY_WARNING
    ) {
      factors.push({
        id: 'wal_archiving',
        label: 'WAL arxivlash',
        status: 'warning',
        impact: -5,
        detail: `${archiver.readyCount} ta WAL segmenti arxivlanishini kutmoqda`,
        code: 'backlog',
        params: { ready: archiver.readyCount },
      });
    } else {
      factors.push({
        id: 'wal_archiving',
        label: 'WAL arxivlash',
        status: 'ok',
        impact: 0,
        code: 'ok',
        params: { wal: archiver.lastArchivedWal ?? '-' },
      });
    }
  } else if (replication.isPrimary) {
    factors.push({
      id: 'wal_archiving',
      label: 'WAL arxivlash',
      status: 'info',
      impact: 0,
      detail: "archive_mode o'chiq — PITR imkoni yo'q",
      code: 'off',
    });
  }

  return factors;
}
