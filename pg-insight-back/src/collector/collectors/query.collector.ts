import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { BaseCollector } from '../base.collector';
import { TargetPoolManager } from '../../targets/target-pool.manager';

export type QueryTag =
  | 'slow'
  | 'very-slow'
  | 'inconsistent'
  | 'low-cache'
  | 'full-scan'
  | 'high-rows'
  | 'frequent'
  | 'write-heavy';

export interface QueryStat {
  queryId: string;
  queryText: string;
  calls: number;
  totalTimeMs: number;
  meanTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  stddevTimeMs: number;
  planTimeMs: number;
  rowsTotal: number;
  rowsPerCall: number;
  cacheHitRatio: number;
  sharedBlksHit: number;
  sharedBlksRead: number;
  sharedBlksDirtied: number;
  sharedBlksWritten: number;
  walBytes: number;
  dbName: string;
  userId: number;
  tags: QueryTag[];
  isSlow: boolean;
  isFrequent: boolean;
  isWriteHeavy: boolean;
}

export interface QuerySnapshot {
  totalUniqueQueries: number;
  queries: QueryStat[];
  hasStatStatements: boolean;
  totalCallsPerSec: number;
  topByMeanTime: QueryStat[];
  topByCalls: QueryStat[];
  topByTotalTime: QueryStat[];
}

@Injectable()
export class QueryCollector extends BaseCollector<QuerySnapshot> {
  protected readonly logger = new Logger(QueryCollector.name);
  protected readonly name = 'QueryCollector';

  private readonly slowQueryThresholdMs = 1000;
  private readonly maxQueries = 100;

  constructor(poolManager: TargetPoolManager) {
    super(poolManager);
  }

  protected async collect(
    pool: Pool,
    _targetId: string,
  ): Promise<QuerySnapshot> {
    const hasExt = await this.extensionExists(pool, 'pg_stat_statements');

    if (!hasExt) {
      this.logger.warn(
        'pg_stat_statements extension not found. ' +
          'Add to shared_preload_libraries for query statistics.',
      );
      return {
        totalUniqueQueries: 0,
        queries: [],
        hasStatStatements: false,
        totalCallsPerSec: 0,
        topByMeanTime: [],
        topByCalls: [],
        topByTotalTime: [],
      };
    }

    const versionResult = await pool.query<{ version_num: string }>(
      `SELECT current_setting('server_version_num') AS version_num`,
    );
    const versionNum = parseInt(versionResult.rows[0].version_num, 10);
    const hasPlanTime = versionNum >= 130000;
    const hasWalBytes = versionNum >= 130000;

    const result = await pool.query<{
      queryid: string;
      query: string;
      calls: string;
      total_exec_time: string;
      mean_exec_time: string;
      min_exec_time: string;
      max_exec_time: string;
      stddev_exec_time: string;
      plan_time: string;
      rows: string;
      shared_blks_hit: string;
      shared_blks_read: string;
      shared_blks_dirtied: string;
      shared_blks_written: string;
      wal_bytes: string;
      db_name: string;
      userid: string;
    }>(
      `
      SELECT
        queryid::TEXT,
        -- Query text: 200 char yetarli identifikatsiya uchun
        -- Ko'proq bo'lsa xotira isrofiga olib keladi
        LEFT(query, 200)                                AS query,
        calls,
        total_exec_time,
        mean_exec_time,
        min_exec_time,
        max_exec_time,
        stddev_exec_time,

        -- plan_time: PostgreSQL 13+ da mavjud
        -- COALESCE — eski versiyalarda 0 qaytaradi
        ${hasPlanTime ? 'COALESCE(plan_time, 0)' : '0'}  AS plan_time,

        rows,
        shared_blks_hit,
        shared_blks_read,
        shared_blks_dirtied,
        shared_blks_written,

        -- wal_bytes: PostgreSQL 13+ da mavjud (WAL write load)
        ${hasWalBytes ? 'COALESCE(wal_bytes, 0)' : '0'}   AS wal_bytes,

        -- Qaysi database'ga tegishli
        (SELECT datname FROM pg_database WHERE oid = dbid) AS db_name,
        userid

      FROM pg_stat_statements

      WHERE
        -- Faqat current database'ning query'lari
        -- (agar pg_stat_statements shared bo'lsa, barcha DB query'lari bo'ladi)
        dbid = (SELECT oid FROM pg_database WHERE datname = current_database())

        -- Minimal calls filter — noise kamaytirish
        -- 1-2 marta ishlagan query meaningful emas
        AND calls >= 3

        -- System internal query'larni filtrlaymiz
        AND query NOT ILIKE 'SET %'
        AND query NOT ILIKE 'BEGIN'
        AND query NOT ILIKE 'COMMIT'
        AND query NOT ILIKE 'ROLLBACK'
        AND query NOT ILIKE 'SHOW %'
        -- pg_stat_statements o'zini o'zi ko'rmasin
        AND query NOT ILIKE '%pg_stat_statements%'
        -- NULL query'lar bo'lishi mumkin (parallel worker)
        AND query IS NOT NULL

      ORDER BY
        -- Eng uzoq ishlayotganlar birinchi
        mean_exec_time DESC

      LIMIT $1
    `,
      [this.maxQueries],
    );

    const queries: QueryStat[] = result.rows.map((row) => {
      const calls = parseInt(row.calls, 10);
      const meanTimeMs = parseFloat(row.mean_exec_time);
      const stddevTimeMs = parseFloat(row.stddev_exec_time);
      const sharedBlksHit = parseInt(row.shared_blks_hit, 10);
      const sharedBlksRead = parseInt(row.shared_blks_read, 10);
      const totalAccess = sharedBlksHit + sharedBlksRead;
      const rowsTotal = parseInt(row.rows, 10);
      const walBytes = parseInt(row.wal_bytes, 10);
      const sharedBlksDirtied = parseInt(row.shared_blks_dirtied, 10);

      const cacheHitRatio = totalAccess > 0 ? sharedBlksHit / totalAccess : 1.0;

      const rowsPerCall = calls > 0 ? rowsTotal / calls : 0;

      const tags: QueryTag[] = [];

      if (meanTimeMs >= this.slowQueryThresholdMs * 10) tags.push('very-slow');
      else if (meanTimeMs >= this.slowQueryThresholdMs) tags.push('slow');

      if (stddevTimeMs > meanTimeMs * 0.5) tags.push('inconsistent');

      if (cacheHitRatio < 0.9) tags.push('low-cache');

      if (rowsPerCall > 10_000) tags.push('high-rows');

      if (calls > 1_000) tags.push('frequent');

      if (sharedBlksDirtied > 1000) tags.push('write-heavy');

      return {
        queryId: row.queryid,
        queryText: row.query,
        calls,
        totalTimeMs: parseFloat(row.total_exec_time),
        meanTimeMs,
        minTimeMs: parseFloat(row.min_exec_time),
        maxTimeMs: parseFloat(row.max_exec_time),
        stddevTimeMs,
        planTimeMs: parseFloat(row.plan_time),
        rowsTotal,
        rowsPerCall: Math.round(rowsPerCall),
        cacheHitRatio: Math.round(cacheHitRatio * 1000) / 1000,
        sharedBlksHit,
        sharedBlksRead,
        sharedBlksDirtied,
        sharedBlksWritten: parseInt(row.shared_blks_written, 10),
        walBytes,
        dbName: row.db_name ?? 'unknown',
        userId: parseInt(row.userid, 10),
        tags,
        isSlow: meanTimeMs >= this.slowQueryThresholdMs,
        isFrequent: calls > 1_000,
        isWriteHeavy: sharedBlksDirtied > 1000,
      };
    });

    const topByMeanTime = [...queries]
      .sort((a, b) => b.meanTimeMs - a.meanTimeMs)
      .slice(0, 5);
    const topByCalls = [...queries]
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 5);
    const topByTotalTime = [...queries]
      .sort((a, b) => b.totalTimeMs - a.totalTimeMs)
      .slice(0, 5);

    return {
      totalUniqueQueries: result.rowCount ?? 0,
      queries,
      hasStatStatements: true,
      totalCallsPerSec: 0,
      topByMeanTime,
      topByCalls,
      topByTotalTime,
    };
  }
}
