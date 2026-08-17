import { Injectable, Inject, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { PLATFORM_POOL } from '../../database/token';

export interface TimePoint {
  time: string;
  value: number;
}

export interface ConnectionTrend {
  time: string;
  total: number;
  active: number;
  idle: number;
  idleInTx: number;
  waiting: number;
  utilizationPct: number;
}

export interface QueryPerformanceTrend {
  time: string;
  queryId: string;
  queryText: string;
  avgMeanMs: number;
  maxMs: number;
  totalCalls: number;
  cacheHit: number;
}

export interface LockEventSummary {
  time: string;
  waitingLocks: number;
  hasDeadlock: boolean;
  severity: string;
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

export interface TopSlowQuery {
  queryId: string;
  queryText: string;
  avgMeanMs: number;
  maxMs: number;
  stddevMs: number;
  totalCalls: number;
  cacheHitRatio: number;
  tags: string[];
}

export interface TableBloatInfo {
  tableName: string;
  bloatRatio: number;
  deadTuples: number;
  liveTuples: number;
  sizeBytes: number;
}

@Injectable()
export class MetricsReaderService {
  private readonly logger = new Logger(MetricsReaderService.name);

  constructor(@Inject(PLATFORM_POOL) private readonly pool: Pool) {}

  async getDashboardSummary(targetId: string): Promise<DashboardSummary> {
    const [latestConn, queryStats, lockStats, vacuumStats, replStats] =
      await Promise.all([
        this.getLatestConnections(targetId),
        this.getQueryStats1h(targetId),
        this.getLockStats1h(targetId),
        this.getVacuumStats(targetId),
        this.getReplicationStats(targetId),
      ]);

    return {
      connections: latestConn,
      slowQueriesCount: queryStats.slowCount,
      lockWaitsCount: lockStats.totalWaits,
      avgCacheHitRatio: queryStats.avgCacheHit,
      deadlocksTotal: lockStats.deadlocks,
      hasXidRisk: vacuumStats.hasXidRisk,
      maxXidAge: vacuumStats.maxXidAge,
      activeVacuums: vacuumStats.activeVacuums,
      replicationLagMb: replStats.maxLagMb,
      activeAlertsCount: 0,
      criticalAlertsCount: 0,
    };
  }

  private async getLatestConnections(targetId: string) {
    const result = await this.pool
      .query<{
        total: string;
        active: string;
        idle: string;
        idle_in_tx: string;
        waiting: string;
        utilization_pct: string;
        max_connections: string;
        longest_query_ms: string;
      }>(
        `
      SELECT total, active, idle, idle_in_tx, waiting,
             utilization_pct, max_connections, longest_query_ms
      FROM connection_metrics
      WHERE target_id = $1
      ORDER BY time DESC
      LIMIT 1
    `,
        [targetId],
      )
      .catch(() => ({ rows: [] as never[] }));

    if (result.rows.length === 0) return null;
    const r = result.rows[0];
    return {
      total: parseInt(r.total, 10),
      active: parseInt(r.active, 10),
      idle: parseInt(r.idle, 10),
      idleInTx: parseInt(r.idle_in_tx, 10),
      utilizationPct: parseFloat(r.utilization_pct),
      maxConnections: parseInt(r.max_connections, 10),
      longestQueryMs: parseInt(r.longest_query_ms, 10),
    };
  }

  private async getQueryStats1h(targetId: string) {
    const result = await this.pool
      .query<{
        slow_count: string;
        avg_cache_hit: string;
      }>(
        `
      SELECT
        COUNT(*) FILTER (WHERE mean_time_ms >= 1000) AS slow_count,
        COALESCE(AVG(cache_hit_ratio), 1)            AS avg_cache_hit
      FROM query_metrics
      WHERE target_id = $1
        AND time >= NOW() - INTERVAL '1 hour'
    `,
        [targetId],
      )
      .catch(() => ({ rows: [{ slow_count: '0', avg_cache_hit: '1' }] }));

    return {
      slowCount: parseInt(result.rows[0].slow_count, 10),
      avgCacheHit: parseFloat(result.rows[0].avg_cache_hit),
    };
  }

  private async getLockStats1h(targetId: string) {
    const result = await this.pool
      .query<{
        total_waits: string;
        deadlocks: string;
      }>(
        `
      SELECT
        COALESCE(SUM(waiting_locks), 0) AS total_waits,
        COALESCE(MAX(deadlocks_total), 0) AS deadlocks
      FROM lock_metrics
      WHERE target_id = $1
        AND time >= NOW() - INTERVAL '1 hour'
    `,
        [targetId],
      )
      .catch(() => ({ rows: [{ total_waits: '0', deadlocks: '0' }] }));

    return {
      totalWaits: parseInt(result.rows[0].total_waits, 10),
      deadlocks: parseInt(result.rows[0].deadlocks, 10),
    };
  }

  private async getVacuumStats(targetId: string) {
    const result = await this.pool
      .query<{
        has_xid_risk: boolean;
        max_xid_age: string;
        active_vacuums: string;
      }>(
        `
      SELECT has_xid_risk, max_xid_age, active_vacuums
      FROM vacuum_metrics
      WHERE target_id = $1
      ORDER BY time DESC LIMIT 1
    `,
        [targetId],
      )
      .catch(() => ({
        rows: [{ has_xid_risk: false, max_xid_age: '0', active_vacuums: '0' }],
      }));

    const r = result.rows[0];
    return {
      hasXidRisk: r.has_xid_risk,
      maxXidAge: parseInt(r.max_xid_age, 10),
      activeVacuums: parseInt(r.active_vacuums, 10),
    };
  }

  private async getReplicationStats(targetId: string) {
    const result = await this.pool
      .query<{ max_lag_bytes: string }>(
        `
      SELECT max_lag_bytes FROM replication_metrics
      WHERE target_id = $1 ORDER BY time DESC LIMIT 1
    `,
        [targetId],
      )
      .catch(() => ({ rows: [] as never[] }));

    if (result.rows.length === 0) return { maxLagMb: null };
    const bytes = parseInt(result.rows[0].max_lag_bytes, 10);
    return { maxLagMb: bytes > 0 ? Math.round(bytes / 1024 / 1024) : 0 };
  }

  async getConnectionTrend(
    targetId: string,
    hours: number = 1,
    bucketMinutes: number = 1,
  ): Promise<ConnectionTrend[]> {
    const useHourly = hours > 6 && bucketMinutes >= 60;

    if (useHourly) {
      const result = await this.pool
        .query<{
          bucket: string;
          avg_total: string;
          avg_active: string;
          avg_idle: string;
          avg_utilization_pct: string;
          max_total: string;
        }>(
          `
        SELECT
          bucket,
          avg_total,
          avg_active,
          COALESCE(avg_total::INT - avg_active::INT, 0) AS avg_idle,
          avg_utilization_pct,
          max_total
        FROM conn_metrics_hourly
        WHERE target_id = $1
          AND bucket >= NOW() - ($2 || ' hours')::INTERVAL
        ORDER BY bucket ASC
      `,
          [targetId, hours],
        )
        .catch(() => ({ rows: [] as never[] }));

      return result.rows.map((r) => ({
        time: r.bucket,
        total: parseInt(r.avg_total, 10),
        active: parseInt(r.avg_active, 10),
        idle: parseInt(r.avg_idle, 10),
        idleInTx: 0,
        waiting: 0,
        utilizationPct: parseFloat(r.avg_utilization_pct),
      }));
    }

    const result = await this.pool
      .query<{
        bucket: string;
        avg_total: string;
        avg_active: string;
        avg_idle: string;
        avg_idle_in_tx: string;
        avg_waiting: string;
        avg_util: string;
      }>(
        `
      SELECT
        time_bucket($1::INTERVAL, time)  AS bucket,
        AVG(total)::INT                  AS avg_total,
        AVG(active)::INT                 AS avg_active,
        AVG(idle)::INT                   AS avg_idle,
        AVG(idle_in_tx)::INT             AS avg_idle_in_tx,
        AVG(waiting)::INT                AS avg_waiting,
        AVG(utilization_pct)             AS avg_util
      FROM connection_metrics
      WHERE target_id = $2
        AND time >= NOW() - ($3 || ' hours')::INTERVAL
      GROUP BY bucket
      ORDER BY bucket ASC
    `,
        [`${bucketMinutes} minutes`, targetId, hours],
      )
      .catch(() => ({ rows: [] as never[] }));

    return result.rows.map((r) => ({
      time: r.bucket,
      total: parseInt(r.avg_total, 10),
      active: parseInt(r.avg_active, 10),
      idle: parseInt(r.avg_idle, 10),
      idleInTx: parseInt(r.avg_idle_in_tx, 10),
      waiting: parseInt(r.avg_waiting, 10),
      utilizationPct: parseFloat(r.avg_util),
    }));
  }

  async getTopSlowQueries(
    targetId: string,
    hours: number = 24,
    limit: number = 20,
  ): Promise<TopSlowQuery[]> {
    const result = await this.pool
      .query<{
        query_id: string;
        query_text: string;
        avg_mean_ms: string;
        max_ms: string;
        stddev_ms: string;
        total_calls: string;
        avg_cache_hit: string;
        tags: string;
      }>(
        `
      SELECT
        query_id,
        LAST(query_text, time)          AS query_text,
        AVG(mean_time_ms)               AS avg_mean_ms,
        MAX(max_time_ms)                AS max_ms,
        AVG(stddev_time_ms)             AS stddev_ms,
        SUM(calls)                      AS total_calls,
        AVG(cache_hit_ratio)            AS avg_cache_hit,
        LAST(tags, time)                AS tags
      FROM query_metrics
      WHERE target_id = $1
        AND time >= NOW() - ($2 || ' hours')::INTERVAL
        AND mean_time_ms >= 100
      GROUP BY query_id
      ORDER BY avg_mean_ms DESC
      LIMIT $3
    `,
        [targetId, hours, limit],
      )
      .catch(() => ({ rows: [] as never[] }));

    return result.rows.map((r) => ({
      queryId: r.query_id,
      queryText: r.query_text ?? '',
      avgMeanMs: parseFloat(r.avg_mean_ms),
      maxMs: parseFloat(r.max_ms),
      stddevMs: parseFloat(r.stddev_ms),
      totalCalls: parseInt(r.total_calls, 10),
      cacheHitRatio: parseFloat(r.avg_cache_hit),
      tags: r.tags ? r.tags.split(',').filter(Boolean) : [],
    }));
  }

  async getLockTrend(
    targetId: string,
    hours: number = 6,
    bucketMinutes: number = 5,
  ): Promise<LockEventSummary[]> {
    const result = await this.pool
      .query<{
        bucket: string;
        waiting: string;
        has_deadlock: boolean;
        severity: string;
      }>(
        `
      SELECT
        time_bucket($1::INTERVAL, time) AS bucket,
        SUM(waiting_locks)::INT         AS waiting,
        BOOL_OR(has_deadlock_risk)      AS has_deadlock,
        MAX(CASE severity
          WHEN 'critical' THEN 'critical'
          WHEN 'high'     THEN 'high'
          WHEN 'medium'   THEN 'medium'
          ELSE 'low'
        END)                            AS severity
      FROM lock_metrics
      WHERE target_id = $2
        AND time >= NOW() - ($3 || ' hours')::INTERVAL
      GROUP BY bucket
      ORDER BY bucket ASC
    `,
        [`${bucketMinutes} minutes`, targetId, hours],
      )
      .catch(() => ({ rows: [] as never[] }));

    return result.rows.map((r) => ({
      time: r.bucket,
      waitingLocks: parseInt(r.waiting, 10),
      hasDeadlock: r.has_deadlock,
      severity: r.severity ?? 'low',
    }));
  }

  async getCacheHitTrend(
    targetId: string,
    hours: number = 24,
    bucketMinutes: number = 30,
  ): Promise<TimePoint[]> {
    const result = await this.pool
      .query<{
        bucket: string;
        avg_hit: string;
      }>(
        `
      SELECT
        time_bucket($1::INTERVAL, time) AS bucket,
        AVG(cache_hit_ratio)            AS avg_hit
      FROM io_buffer_metrics
      WHERE target_id = $2
        AND time >= NOW() - ($3 || ' hours')::INTERVAL
      GROUP BY bucket
      ORDER BY bucket ASC
    `,
        [`${bucketMinutes} minutes`, targetId, hours],
      )
      .catch(() => ({ rows: [] as never[] }));

    return result.rows.map((r) => ({
      time: r.bucket,
      value: parseFloat(r.avg_hit),
    }));
  }

  async getTableBloatTop(
    targetId: string,
    limit: number = 10,
  ): Promise<TableBloatInfo[]> {
    const result = await this.pool
      .query<{
        table_name: string;
        bloat_ratio: string;
        dead_tuples: string;
        live_tuples: string;
        size_bytes: string;
      }>(
        `
      SELECT
        table_name,
        LAST(bloat_ratio, time)     AS bloat_ratio,
        LAST(dead_tuples, time)     AS dead_tuples,
        LAST(live_tuples, time)     AS live_tuples,
        LAST(total_size_bytes, time) AS size_bytes
      FROM table_metrics
      WHERE target_id = $1
        AND time >= NOW() - INTERVAL '2 hours'
      GROUP BY table_name
      ORDER BY bloat_ratio DESC
      LIMIT $2
    `,
        [targetId, limit],
      )
      .catch(() => ({ rows: [] as never[] }));

    return result.rows.map((r) => ({
      tableName: r.table_name,
      bloatRatio: parseFloat(r.bloat_ratio),
      deadTuples: parseInt(r.dead_tuples, 10),
      liveTuples: parseInt(r.live_tuples, 10),
      sizeBytes: parseInt(r.size_bytes, 10),
    }));
  }

  async getReplicationLagTrend(
    targetId: string,
    hours: number = 6,
    bucketMinutes: number = 5,
  ): Promise<TimePoint[]> {
    const result = await this.pool
      .query<{
        bucket: string;
        max_lag: string;
      }>(
        `
      SELECT
        time_bucket($1::INTERVAL, time) AS bucket,
        MAX(max_lag_bytes)              AS max_lag
      FROM replication_metrics
      WHERE target_id = $2
        AND time >= NOW() - ($3 || ' hours')::INTERVAL
      GROUP BY bucket
      ORDER BY bucket ASC
    `,
        [`${bucketMinutes} minutes`, targetId, hours],
      )
      .catch(() => ({ rows: [] as never[] }));

    return result.rows.map((r) => ({
      time: r.bucket,
      value: parseInt(r.max_lag, 10),
    }));
  }

  async getXidAgeTrend(
    targetId: string,
    hours: number = 24,
  ): Promise<TimePoint[]> {
    const result = await this.pool
      .query<{
        bucket: string;
        max_age: string;
      }>(
        `
      SELECT
        time_bucket('30 minutes', time) AS bucket,
        MAX(max_xid_age)                AS max_age
      FROM vacuum_metrics
      WHERE target_id = $1
        AND time >= NOW() - ($2 || ' hours')::INTERVAL
      GROUP BY bucket
      ORDER BY bucket ASC
    `,
        [targetId, hours],
      )
      .catch(() => ({ rows: [] as never[] }));

    return result.rows.map((r) => ({
      time: r.bucket,
      value: parseInt(r.max_age, 10),
    }));
  }

  async getConnectionsByApp(
    targetId: string,
  ): Promise<Array<{ appName: string; count: number }>> {
    const result = await this.pool
      .query<{
        app_name: string;
        count: string;
      }>(
        `
      SELECT app_name, count
      FROM connection_by_app
      WHERE target_id = $1
        AND time = (
          SELECT MAX(time) FROM connection_by_app WHERE target_id = $1
        )
      ORDER BY count DESC
      LIMIT 15
    `,
        [targetId],
      )
      .catch(() => ({ rows: [] as never[] }));

    return result.rows.map((r) => ({
      appName: r.app_name || '(unknown)',
      count: parseInt(r.count, 10),
    }));
  }

  async getQueryVolumeTrend(
    targetId: string,
    hours: number = 6,
    bucketMinutes: number = 5,
  ): Promise<TimePoint[]> {
    const result = await this.pool
      .query<{
        bucket: string;
        total_calls: string;
      }>(
        `
      SELECT
        time_bucket($1::INTERVAL, time) AS bucket,
        SUM(calls)                      AS total_calls
      FROM query_metrics
      WHERE target_id = $2
        AND time >= NOW() - ($3 || ' hours')::INTERVAL
      GROUP BY bucket
      ORDER BY bucket ASC
    `,
        [`${bucketMinutes} minutes`, targetId, hours],
      )
      .catch(() => ({ rows: [] as never[] }));

    return result.rows.map((r) => ({
      time: r.bucket,
      value: parseInt(r.total_calls, 10),
    }));
  }

  async getCheckpointTrend(
    targetId: string,
    hours: number = 6,
  ): Promise<Array<{ time: string; timed: number; requested: number }>> {
    const result = await this.pool
      .query<{
        bucket: string;
        timed: string;
        requested: string;
      }>(
        `
      SELECT
        time_bucket('10 minutes', time)  AS bucket,
        MAX(checkpoints_timed)           AS timed,
        MAX(checkpoints_req)             AS requested
      FROM io_buffer_metrics
      WHERE target_id = $1
        AND time >= NOW() - ($2 || ' hours')::INTERVAL
      GROUP BY bucket
      ORDER BY bucket ASC
    `,
        [targetId, hours],
      )
      .catch(() => ({ rows: [] as never[] }));

    return result.rows.map((r) => ({
      time: r.bucket,
      timed: parseInt(r.timed, 10),
      requested: parseInt(r.requested, 10),
    }));
  }
}
