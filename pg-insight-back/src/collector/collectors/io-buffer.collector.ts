import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { BaseCollector } from '../base.collector';
import { TargetPoolManager } from '../../targets/target-pool.manager';

export interface BgwriterStats {
  checkpointsTimed: number;
  checkpointsReq: number;
  checkpointWriteTimeMs: number;
  checkpointSyncTimeMs: number;
  buffersCheckpoint: number;
  buffersClean: number;
  maxWrittenClean: number;
  buffersBackend: number;
  buffersBackendFsync: number;
  buffersAlloc: number;
  statsResetTime: Date | null;
}

export interface DatabaseIoStats {
  dbName: string;
  blksRead: number;
  blksHit: number;
  cacheHitRatio: number; // 0-1
  transactionsTotal: number;
  commits: number;
  rollbacks: number;
  deadlocks: number;
  tempFiles: number;
  tempBytes: number;
  statsResetTime: Date | null;
}

export interface BufferCacheTopEntry {
  schemaName: string;
  tableName: string;
  buffersUsed: number;
  sizeInCache: number;
  pctOfCache: number;
  isDirty: number;
  isUsed: number;
}

export interface IoSettings {
  sharedBuffersMb: number; // shared_buffers in MB
  effectiveCacheSize: number; // effective_cache_size MB (planner hint)
  checkpointTimeout: number; // seconds
  checkpointCompletionTarget: number; // 0.0-1.0
  walBuffersMb: number;
  bgwriterLruMaxpages: number;
  bgwriterDelay: number; // ms
  synchronousCommit: string; // on | off | local | ...
}

export interface IoBufferSnapshot {
  bgwriter: BgwriterStats;
  databases: DatabaseIoStats[];
  currentDbIo: DatabaseIoStats | null;
  bufferCacheTop?: BufferCacheTopEntry[];
  hasPgBuffercache: boolean;
  settings: IoSettings;
  cacheHitRatio: number;
  isHealthy: boolean;
  checkpointPressure: number;
}

@Injectable()
export class IoBufferCollector extends BaseCollector<IoBufferSnapshot> {
  protected readonly logger = new Logger(IoBufferCollector.name);
  protected readonly name = 'IoBufferCollector';

  constructor(poolManager: TargetPoolManager) {
    super(poolManager);
  }

  protected async collect(
    pool: Pool,
    _targetId: string,
  ): Promise<IoBufferSnapshot> {
    const hasPgBuffercache = await this.extensionExists(pool, 'pg_buffercache');

    const [bgwriter, databases, settings, bufferCacheTop] = await Promise.all([
      this.getBgwriterStats(pool),
      this.getDatabaseIoStats(pool),
      this.getIoSettings(pool),
      hasPgBuffercache
        ? this.getBufferCacheTop(pool)
        : Promise.resolve(undefined),
    ]);

    const currentDbIo =
      databases.find((d) => d.dbName === 'current') ?? databases[0] ?? null;

    const cacheHitRatio = currentDbIo?.cacheHitRatio ?? 1;
    const totalCheckpoints =
      bgwriter.checkpointsTimed + bgwriter.checkpointsReq;
    const checkpointPressure =
      totalCheckpoints > 0 ? bgwriter.checkpointsReq / totalCheckpoints : 0;

    const isHealthy =
      cacheHitRatio > 0.95 &&
      checkpointPressure < 0.5 &&
      bgwriter.buffersBackend < bgwriter.buffersClean * 0.1;

    return {
      bgwriter,
      databases,
      currentDbIo,
      bufferCacheTop,
      hasPgBuffercache,
      settings,
      cacheHitRatio,
      isHealthy,
      checkpointPressure,
    };
  }

  private async getBgwriterStats(pool: Pool): Promise<BgwriterStats> {
    const result = await pool.query<{
      checkpoints_timed: string;
      checkpoints_req: string;
      checkpoint_write_time: string;
      checkpoint_sync_time: string;
      buffers_checkpoint: string;
      buffers_clean: string;
      maxwritten_clean: string;
      buffers_backend: string;
      buffers_backend_fsync: string;
      buffers_alloc: string;
      stats_reset: Date | null;
    }>('SELECT * FROM pg_stat_bgwriter');

    const row = result.rows[0];
    return {
      checkpointsTimed: parseInt(row.checkpoints_timed, 10),
      checkpointsReq: parseInt(row.checkpoints_req, 10),
      checkpointWriteTimeMs: parseFloat(row.checkpoint_write_time),
      checkpointSyncTimeMs: parseFloat(row.checkpoint_sync_time),
      buffersCheckpoint: parseInt(row.buffers_checkpoint, 10),
      buffersClean: parseInt(row.buffers_clean, 10),
      maxWrittenClean: parseInt(row.maxwritten_clean, 10),
      buffersBackend: parseInt(row.buffers_backend, 10),
      buffersBackendFsync: parseInt(row.buffers_backend_fsync, 10),
      buffersAlloc: parseInt(row.buffers_alloc, 10),
      statsResetTime: row.stats_reset,
    };
  }

  private async getDatabaseIoStats(pool: Pool): Promise<DatabaseIoStats[]> {
    const result = await pool.query<{
      datname: string;
      blks_read: string;
      blks_hit: string;
      xact_commit: string;
      xact_rollback: string;
      deadlocks: string;
      temp_files: string;
      temp_bytes: string;
      stats_reset: Date | null;
    }>(`
      SELECT
        datname,
        blks_read,
        blks_hit,
        xact_commit,
        xact_rollback,
        deadlocks,
        temp_files,
        temp_bytes,
        stats_reset
      FROM pg_stat_database
      WHERE datname IS NOT NULL
        AND datname NOT IN ('template0', 'template1')
      ORDER BY (blks_hit + blks_read) DESC
    `);

    return result.rows.map((row) => {
      const blksRead = parseInt(row.blks_read, 10);
      const blksHit = parseInt(row.blks_hit, 10);
      const total = blksRead + blksHit;
      const commits = parseInt(row.xact_commit, 10);
      const rollbacks = parseInt(row.xact_rollback, 10);

      return {
        dbName: row.datname,
        blksRead,
        blksHit,
        cacheHitRatio: total > 0 ? blksHit / total : 1,
        transactionsTotal: commits + rollbacks,
        commits,
        rollbacks,
        deadlocks: parseInt(row.deadlocks, 10),
        tempFiles: parseInt(row.temp_files, 10),
        tempBytes: parseInt(row.temp_bytes, 10),
        statsResetTime: row.stats_reset,
      };
    });
  }

  private async getBufferCacheTop(pool: Pool): Promise<BufferCacheTopEntry[]> {
    const result = await pool
      .query<{
        schema_name: string;
        table_name: string;
        buffers_used: string;
        size_in_cache: string;
        pct_of_cache: string;
        is_dirty: string;
        is_used: string;
      }>(
        `
      SELECT
        n.nspname                   AS schema_name,
        c.relname                   AS table_name,
        COUNT(*)                    AS buffers_used,
        COUNT(*) * 8192             AS size_in_cache,  -- 8KB per page (default)
        ROUND(
          COUNT(*) * 100.0 /
          (SELECT COUNT(*) FROM pg_buffercache WHERE relfilenode IS NOT NULL),
          2
        )                           AS pct_of_cache,
        SUM(CASE WHEN b.isdirty THEN 1 ELSE 0 END) AS is_dirty,
        SUM(b.usagecount)           AS is_used
      FROM pg_buffercache b
      JOIN pg_class c ON c.relfilenode = b.relfilenode
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE b.relfilenode IS NOT NULL
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND c.relkind = 'r'  -- faqat tables
      GROUP BY n.nspname, c.relname
      ORDER BY buffers_used DESC
      LIMIT 20
    `,
      )
      .catch(() => ({ rows: [] as never[] }));

    return result.rows.map((row) => ({
      schemaName: row.schema_name,
      tableName: row.table_name,
      buffersUsed: parseInt(row.buffers_used, 10),
      sizeInCache: parseInt(row.size_in_cache, 10),
      pctOfCache: parseFloat(row.pct_of_cache),
      isDirty: parseInt(row.is_dirty, 10),
      isUsed: parseInt(row.is_used, 10),
    }));
  }

  private async getIoSettings(pool: Pool): Promise<IoSettings> {
    const result = await pool.query<{
      name: string;
      setting: string;
      unit: string | null;
    }>(`
      SELECT name, setting, unit FROM pg_settings
      WHERE name IN (
        'shared_buffers',
        'effective_cache_size',
        'checkpoint_timeout',
        'checkpoint_completion_target',
        'wal_buffers',
        'bgwriter_lru_maxpages',
        'bgwriter_delay',
        'synchronous_commit'
      )
    `);

    const s = Object.fromEntries(
      result.rows.map((r) => [r.name, { v: r.setting, u: r.unit }]),
    );

    const sharedBuffersBlocks = parseInt(s['shared_buffers']?.v ?? '16384', 10);

    return {
      sharedBuffersMb: Math.round((sharedBuffersBlocks * 8) / 1024),
      effectiveCacheSize: Math.round(
        (parseInt(s['effective_cache_size']?.v ?? '524288', 10) * 8) / 1024,
      ),
      checkpointTimeout: parseInt(s['checkpoint_timeout']?.v ?? '300', 10),
      checkpointCompletionTarget: parseFloat(
        s['checkpoint_completion_target']?.v ?? '0.9',
      ),
      walBuffersMb: Math.round(
        (parseInt(s['wal_buffers']?.v ?? '512', 10) * 8) / 1024,
      ),
      bgwriterLruMaxpages: parseInt(s['bgwriter_lru_maxpages']?.v ?? '100', 10),
      bgwriterDelay: parseInt(s['bgwriter_delay']?.v ?? '200', 10),
      synchronousCommit: s['synchronous_commit']?.v ?? 'on',
    };
  }
}
