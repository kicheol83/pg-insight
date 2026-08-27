import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { TargetPoolManager } from '../targets/target-pool.manager';
import { PrismaService } from '../database/prisma.service';

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

  async explainQuery(targetId: string, sql: string) {
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

    const pool = this.poolManager.getPool(targetId);
    if (!pool) throw new BadRequestException('Target is not connected');

    const client = await pool.connect();
    const start = Date.now();
    try {
      await client.query('BEGIN TRANSACTION READ ONLY');
      const result = await client.query<{ 'QUERY PLAN': unknown }>(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${trimmed}`,
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

      return { plan: [plan], executionTimeMs, recommendations };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {}
      const message = (error as Error).message ?? '';
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

    const settingsRows = await this.poolManager.query<{
      name: string;
      setting: string;
    }>(
      targetId,
      `
      SELECT name, setting FROM pg_settings
      WHERE name IN ('autovacuum','autovacuum_max_workers','vacuum_freeze_table_age','autovacuum_freeze_max_age')
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
      },
    };
  }

  async getReplication(targetId: string) {
    const recoveryRows = await this.poolManager.query<{ is_recovery: boolean }>(
      targetId,
      `SELECT pg_is_in_recovery() AS is_recovery`,
    );
    const isPrimary = !recoveryRows[0]?.is_recovery;

    const walSizeRows = await this.poolManager
      .query<{ size: string }>(
        targetId,
        `SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), '0/0') AS size`,
      )
      .catch(() => [{ size: '0' }]);

    let replicas: Record<string, unknown>[] = [];
    if (isPrimary) {
      replicas = await this.poolManager.query<Record<string, unknown>>(
        targetId,
        `
        SELECT
          pid, client_addr::text AS client_addr, application_name, state, sync_state,
          pg_wal_lsn_diff(sent_lsn, write_lsn) AS write_lag_bytes,
          pg_wal_lsn_diff(sent_lsn, flush_lsn) AS flush_lag_bytes,
          pg_wal_lsn_diff(sent_lsn, replay_lsn) AS replay_lag_bytes,
          EXTRACT(EPOCH FROM write_lag) * 1000 AS write_lag_ms,
          EXTRACT(EPOCH FROM flush_lag) * 1000 AS flush_lag_ms,
          EXTRACT(EPOCH FROM replay_lag) * 1000 AS replay_lag_ms,
          reply_time
        FROM pg_stat_replication
      `,
      );
    }

    const replicaInfos = replicas.map((r) => ({
      pid: Number(r.pid),
      clientAddr: String(r.client_addr ?? ''),
      applicationName: String(r.application_name ?? ''),
      state: String(r.state),
      syncState: String(r.sync_state),
      writeLagBytes: Number(r.write_lag_bytes) || 0,
      flushLagBytes: Number(r.flush_lag_bytes) || 0,
      replayLagBytes: Number(r.replay_lag_bytes) || 0,
      totalLagBytes: Number(r.replay_lag_bytes) || 0,
      writeLagMs: r.write_lag_ms != null ? Number(r.write_lag_ms) : null,
      flushLagMs: r.flush_lag_ms != null ? Number(r.flush_lag_ms) : null,
      replayLagMs: r.replay_lag_ms != null ? Number(r.replay_lag_ms) : null,
      replyTime: r.reply_time,
    }));

    const slotRows = await this.poolManager.query<Record<string, unknown>>(
      targetId,
      `
      SELECT slot_name, slot_type, plugin, active, active_pid, database,
        pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) AS wal_bytes
      FROM pg_replication_slots
    `,
    );
    const slots = slotRows.map((r) => {
      const walBytes = Number(r.wal_bytes) || 0;
      return {
        slotName: String(r.slot_name),
        slotType: String(r.slot_type),
        plugin: r.plugin ? String(r.plugin) : null,
        active: Boolean(r.active),
        activePid: r.active_pid ? Number(r.active_pid) : null,
        walBytes,
        isBlocking: walBytes > 1024 ** 3,
        database: r.database ? String(r.database) : null,
      };
    });

    let receiverInfo = null;
    if (!isPrimary) {
      const recvRows = await this.poolManager
        .query<Record<string, unknown>>(
          targetId,
          `
        SELECT status, received_lsn::text AS received_lsn,
          EXTRACT(EPOCH FROM (now() - last_msg_receipt_time)) * 1000 AS latency_ms,
          last_msg_receipt_time
        FROM pg_stat_wal_receiver
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
        };
      }
    }

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
      if (vacuum.maxXidAge >= 1_500_000_000) {
        score -= 25;
        factors.push({
          id: 'xid_age',
          label: 'XID wraparound xavfi',
          status: 'critical',
          impact: -25,
          detail: `Max XID yoshi: ${vacuum.maxXidAge.toLocaleString()} — favqulodda VACUUM FREEZE kerak`,
        });
      } else if (vacuum.hasXidRisk) {
        score -= 12;
        factors.push({
          id: 'xid_age',
          label: 'XID wraparound xavfi',
          status: 'warning',
          impact: -12,
          detail: `Max XID yoshi: ${vacuum.maxXidAge.toLocaleString()}`,
        });
      } else {
        factors.push({
          id: 'xid_age',
          label: 'XID wraparound xavfi',
          status: 'ok',
          impact: 0,
        });
      }
    }

    // 2) Jadval bloat
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
        });
      } else if (tables.tablesNeedingVacuum > 0) {
        score -= 6;
        factors.push({
          id: 'bloat',
          label: 'Jadval bloat',
          status: 'warning',
          impact: -6,
          detail: `${tables.tablesNeedingVacuum} ta jadval VACUUM kutmoqda`,
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
        });
      } else if (avgHit < 0.98) {
        score -= 5;
        factors.push({
          id: 'cache_hit',
          label: 'Buffer cache hit ratio',
          status: 'warning',
          impact: -5,
          detail: `O'rtacha: ${(avgHit * 100).toFixed(1)}%`,
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

    if (connections) {
      if (connections.connectionUsagePct >= 90) {
        score -= 15;
        factors.push({
          id: 'connection_pool',
          label: 'Connection pool holati',
          status: 'critical',
          impact: -15,
          detail: `${connections.connectionUsagePct.toFixed(0)}% band — yangi ulanishlar rad etilishi mumkin`,
        });
      } else if (connections.connectionUsagePct >= 75) {
        score -= 5;
        factors.push({
          id: 'connection_pool',
          label: 'Connection pool holati',
          status: 'warning',
          impact: -5,
          detail: `${connections.connectionUsagePct.toFixed(0)}% band`,
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
          });
        } else if (ageHours > 24) {
          score -= 3;
          factors.push({
            id: 'backup_freshness',
            label: 'Backup yangiligi',
            status: 'info',
            impact: -3,
            detail: `Oxirgi backup ${Math.floor(ageHours)} soat oldin`,
          });
        } else {
          factors.push({
            id: 'backup_freshness',
            label: 'Backup yangiligi',
            status: 'ok',
            impact: 0,
            detail: `Oxirgi backup ${Math.floor(ageHours)} soat oldin`,
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
}

export interface HealthScoreReport {
  targetId: string;
  checkedAt: string;
  score: number; // 0-100
  grade: 'excellent' | 'good' | 'fair' | 'poor';
  factors: HealthFactor[];
}
