import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import type { ConnectionSnapshot } from '../../collector/collectors/connection.collector';
import type { QuerySnapshot } from '../../collector/collectors/query.collector';
import type { LockSnapshot } from '../../collector/collectors/lock.collector';
import type { TableSnapshot } from '../../collector/collectors/table.collector';
import type { VacuumSnapshot } from '../../collector/collectors/vacuum.collector';
import type { ReplicationSnapshot } from '../../collector/collectors/replication.collector';
import type { IoBufferSnapshot } from '../../collector/collectors/io-buffer.collector';
import type { SystemSnapshot } from '../../collector/collectors/system.collector';
import { PLATFORM_POOL } from '../../database/token';

export { PLATFORM_POOL };

export function createPlatformPool(config: ConfigService): Pool {
  const pool = new Pool({
    host: config.get('PLATFORM_DB_HOST', 'localhost'),
    port: config.get<number>('PLATFORM_DB_PORT', 5433),
    user: config.get('PLATFORM_DB_USER', 'platform_user'),
    password: config.get('PLATFORM_DB_PASSWORD', 'platform_pass'),
    database: config.get('PLATFORM_DB_NAME', 'pg_insight_platform'),
    min: 2,
    max: 10,
    application_name: 'pg-insight-writer',
    idleTimeoutMillis: 30_000,
  });

  pool.on('error', (err) => {
    console.error('[PlatformPool] Unexpected error:', err.message);
  });

  return pool;
}

@Injectable()
export class MetricsWriterService implements OnModuleInit {
  private readonly logger = new Logger(MetricsWriterService.name);

  constructor(@Inject(PLATFORM_POOL) private readonly pool: Pool) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.pool.query('SELECT 1');
      this.logger.log('Platform DB (TimescaleDB) connected');

      const result = await this.pool
        .query<{ exists: boolean }>(
          `
        SELECT EXISTS(
          SELECT 1 FROM timescaledb_information.hypertables
          WHERE hypertable_name = 'connection_metrics'
        ) AS exists
      `,
        )
        .catch(() => ({ rows: [{ exists: false }] }));

      if (!result.rows[0].exists) {
        this.logger.warn(
          'TimescaleDB hypertables not found. Run: docker-compose up -d platform_db',
        );
      }
    } catch (error) {
      this.logger.error(
        'Platform DB connection failed:',
        (error as Error).message,
      );
    }
  }

  async writeConnectionSnapshot(
    targetId: string,
    data: ConnectionSnapshot,
  ): Promise<void> {
    await this.safeInsert(
      `INSERT INTO connection_metrics (
        time, target_id, total, active, idle,
        idle_in_tx, waiting, max_connections, utilization_pct,
        longest_query_ms, longest_idle_in_tx_ms
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        new Date(),
        targetId,
        data.totalConnections,
        data.activeQueries,
        data.idleConnections,
        data.idleInTransaction,
        data.waitingForLock,
        data.maxConnections,
        data.connectionUsagePct,
        data.longestQueryMs,
        data.longestIdleInTxMs,
      ],
      'connection_metrics',
    );

    if (data.byApplication.length > 0) {
      const values: unknown[] = [];
      const placeholders: string[] = [];

      data.byApplication.slice(0, 20).forEach((app, i) => {
        const o = i * 4;
        placeholders.push(`($${o + 1},$${o + 2},$${o + 3},$${o + 4})`);
        values.push(new Date(), targetId, app.applicationName, app.count);
      });

      await this.safeInsert(
        `INSERT INTO connection_by_app (time, target_id, app_name, count)
         VALUES ${placeholders.join(',')}`,
        values,
        'connection_by_app',
      );
    }
  }

  async writeLockSnapshot(targetId: string, data: LockSnapshot): Promise<void> {
    const now = new Date();

    await this.safeInsert(
      `INSERT INTO lock_metrics (
        time, target_id, total_locks, waiting_locks, granted_locks,
        has_blockers, has_deadlock_risk, deadlocks_total
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        now,
        targetId,
        data.totalLocks,
        data.waitingLocks,
        data.grantedLocks,
        data.hasBlockers,
        data.hasDeadlockRisk,
        data.deadlocksTotal,
      ],
      'lock_metrics',
    );

    for (const chain of data.blockingChains) {
      await this.safeInsert(
        `INSERT INTO lock_events (
          time, target_id, blocker_pid, blocker_query,
          waiter_count, lock_mode, relation_name,
          severity, max_wait_ms
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          now,
          targetId,
          chain.blockerPid,
          chain.blockerQuery.slice(0, 500),
          chain.waiters.length,
          chain.lockMode,
          chain.lockedRelation,
          chain.severity,
          Math.max(...chain.waiters.map((w) => w.waitMs)),
        ],
        'lock_events',
      );
    }
  }

  async writeQuerySnapshot(
    targetId: string,
    data: QuerySnapshot,
  ): Promise<void> {
    if (data.queries.length === 0) return;

    const now = new Date();

    const values: unknown[] = [];
    const placeholders: string[] = [];

    data.queries.slice(0, 50).forEach((q, i) => {
      const o = i * 13;
      placeholders.push(
        `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},` +
          `$${o + 7},$${o + 8},$${o + 9},$${o + 10},$${o + 11},$${o + 12},$${o + 13})`,
      );
      values.push(
        now,
        targetId,
        q.queryId,
        q.queryText.slice(0, 500),
        q.calls,
        q.totalTimeMs,
        q.meanTimeMs,
        q.maxTimeMs,
        q.stddevTimeMs,
        q.rowsTotal,
        q.cacheHitRatio,
        q.walBytes,
        q.tags.join(','),
      );
    });

    await this.safeInsert(
      `INSERT INTO query_metrics (
        time, target_id, query_id, query_text, calls,
        total_time_ms, mean_time_ms, max_time_ms, stddev_time_ms,
        rows_total, cache_hit_ratio, wal_bytes, tags
      ) VALUES ${placeholders.join(',')}`,
      values,
      'query_metrics',
    );
  }

  async writeTableSnapshot(
    targetId: string,
    data: TableSnapshot,
  ): Promise<void> {
    if (data.tables.length === 0) return;

    const now = new Date();
    const values: unknown[] = [];
    const placeholders: string[] = [];

    data.tables.slice(0, 100).forEach((t, i) => {
      const o = i * 13;
      placeholders.push(
        `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},` +
          `$${o + 7},$${o + 8},$${o + 9},$${o + 10},$${o + 11},$${o + 12},$${o + 13})`,
      );
      values.push(
        now,
        targetId,
        `${t.schemaName}.${t.tableName}`,
        t.liveTuples,
        t.deadTuples,
        t.bloatRatio,
        t.seqScans,
        t.idxScans,
        t.seqScanRatio,
        t.rowsInserted,
        t.rowsUpdated,
        t.rowsDeleted,
        t.totalSizeBytes,
      );
    });

    await this.safeInsert(
      `INSERT INTO table_metrics (
        time, target_id, table_name,
        live_tuples, dead_tuples, bloat_ratio,
        seq_scans, idx_scans, seq_scan_ratio,
        rows_inserted, rows_updated, rows_deleted,
        total_size_bytes
      ) VALUES ${placeholders.join(',')}`,
      values,
      'table_metrics',
    );
  }

  async writeVacuumSnapshot(
    targetId: string,
    data: VacuumSnapshot,
  ): Promise<void> {
    const now = new Date();

    await this.safeInsert(
      `INSERT INTO vacuum_metrics (
        time, target_id, active_vacuums,
        max_xid_age, database_age, has_xid_risk,
        autovacuum_workers, tables_pending_vacuum
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        now,
        targetId,
        data.activeVacuums.length,
        data.maxXidAge,
        data.databaseAge,
        data.hasXidRisk,
        data.autovacuum.activeWorkers,
        data.autovacuum.tablesPendingVacuum,
      ],
      'vacuum_metrics',
    );
  }

  async writeReplicationSnapshot(
    targetId: string,
    data: ReplicationSnapshot,
  ): Promise<void> {
    const now = new Date();

    await this.safeInsert(
      `INSERT INTO replication_metrics (
        time, target_id, is_primary, replica_count,
        max_lag_bytes, has_inactive_slots, total_wal_retained,
        has_lagged_replicas
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        now,
        targetId,
        data.isPrimary,
        data.replicas.length,
        data.maxLagBytes,
        data.hasInactiveSlots,
        data.totalWalRetained,
        data.hasLaggedReplicas,
      ],
      'replication_metrics',
    );

    for (const replica of data.replicas) {
      await this.safeInsert(
        `INSERT INTO replica_lag (
          time, target_id, client_addr, application_name,
          state, sync_state, write_lag_bytes, flush_lag_bytes,
          replay_lag_bytes, total_lag_bytes, replay_lag_ms
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          now,
          targetId,
          replica.clientAddr,
          replica.applicationName,
          replica.state,
          replica.syncState,
          replica.writeLagBytes,
          replica.flushLagBytes,
          replica.replayLagBytes,
          replica.totalLagBytes,
          replica.replayLagMs,
        ],
        'replica_lag',
      );
    }
  }

  async writeIoBufferSnapshot(
    targetId: string,
    data: IoBufferSnapshot,
  ): Promise<void> {
    await this.safeInsert(
      `INSERT INTO io_buffer_metrics (
        time, target_id, cache_hit_ratio, blks_read, blks_hit,
        checkpoints_timed, checkpoints_req,
        buffers_checkpoint, buffers_clean, buffers_backend,
        buffers_backend_fsync, max_written_clean, is_healthy
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        new Date(),
        targetId,
        data.cacheHitRatio,
        data.currentDbIo?.blksRead ?? 0,
        data.currentDbIo?.blksHit ?? 0,
        data.bgwriter.checkpointsTimed,
        data.bgwriter.checkpointsReq,
        data.bgwriter.buffersCheckpoint,
        data.bgwriter.buffersClean,
        data.bgwriter.buffersBackend,
        data.bgwriter.buffersBackendFsync,
        data.bgwriter.maxWrittenClean,
        data.isHealthy,
      ],
      'io_buffer_metrics',
    );
  }

  async writeSystemSnapshot(
    targetId: string,
    data: SystemSnapshot,
  ): Promise<void> {
    await this.safeInsert(
      `INSERT INTO system_info (
        time, target_id, pg_version, pg_version_num,
        max_connections, shared_buffers_mb,
        extension_list, database_count, superuser_count,
        total_db_size_bytes, config_issues_count
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (target_id)
      DO UPDATE SET
        time = EXCLUDED.time,
        pg_version = EXCLUDED.pg_version,
        shared_buffers_mb = EXCLUDED.shared_buffers_mb,
        extension_list = EXCLUDED.extension_list,
        total_db_size_bytes = EXCLUDED.total_db_size_bytes,
        config_issues_count = EXCLUDED.config_issues_count`,
      [
        new Date(),
        targetId,
        data.server.version,
        data.server.versionNum,
        data.server.maxConnections,
        Math.round(
          (parseInt(data.keySettings['shared_buffers'] ?? '16384', 10) * 8) /
            1024,
        ),
        data.extensions.map((e) => e.name).join(','),
        data.databaseCount,
        data.superuserCount,
        data.totalDatabaseSize,
        data.configIssues.length,
      ],
      'system_info',
    );
  }

  private async safeInsert(
    sql: string,
    values: unknown[],
    table: string,
  ): Promise<void> {
    try {
      await this.pool.query(sql, values);
    } catch (error) {
      const msg = (error as Error).message;
      if (msg.includes('does not exist')) {
        this.logger.warn(
          `Table ${table} not found in platform DB. Run migrations.`,
        );
      } else {
        this.logger.error(`Failed to write to ${table}: ${msg}`);
      }
    }
  }
}
