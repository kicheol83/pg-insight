import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { BaseCollector } from '../base.collector';
import { TargetPoolManager } from '../../targets/target-pool.manager';

export interface VacuumProgress {
  pid: number;
  tableName: string;
  schemaName: string;
  phase: string;
  heapBlksTotal: number;
  heapBlksScanned: number;
  heapBlksVacuumed: number;
  indexVacuumCount: number;
  maxDeadTuples: number;
  numDeadTuples: number;
  progressPct: number;
  isAutovacuum: boolean;
}

export interface XidAgeInfo {
  schemaName: string;
  tableName: string;
  age: number;
  relfrozenxid: string;
  ageStatus: 'ok' | 'warning' | 'critical' | 'emergency';
}

export interface AutovacuumStat {
  activeWorkers: number;
  maxWorkers: number;
  tablesPendingVacuum: number;
  tablesPendingAnalyze: number;
  vacuumCount24h: number;
  analyzeCount24h: number;
}

export interface VacuumSnapshot {
  activeVacuums: VacuumProgress[];
  xidAgeRisk: XidAgeInfo[];
  maxXidAge: number;
  hasXidRisk: boolean;
  databaseAge: number;
  databaseFrozenXid: string;
  autovacuum: AutovacuumStat;

  settings: {
    autovacuumEnabled: boolean;
    autovacuumMaxWorkers: number;
    autovacuumVacuumThreshold: number;
    autovacuumAnalyzeThreshold: number;
    vacuumFreezeMaxAge: number;
    autovacuumFreezeMaxAge: number;
  };
}

const XID_WARNING = 500_000_000; // 500M
const XID_CRITICAL = 1_000_000_000; // 1B
const XID_EMERGENCY = 1_500_000_000; // 1.5B

@Injectable()
export class VacuumCollector extends BaseCollector<VacuumSnapshot> {
  protected readonly logger = new Logger(VacuumCollector.name);
  protected readonly name = 'VacuumCollector';

  constructor(poolManager: TargetPoolManager) {
    super(poolManager);
  }

  protected async collect(
    pool: Pool,
    _targetId: string,
  ): Promise<VacuumSnapshot> {
    const [progressData, xidData, autovacuumData, settingsData] =
      await Promise.all([
        this.getVacuumProgress(pool),
        this.getXidAge(pool),
        this.getAutovacuumStats(pool),
        this.getVacuumSettings(pool),
      ]);

    const maxXidAge = xidData.reduce((max, t) => Math.max(max, t.age), 0);
    const hasXidRisk = xidData.some((t) => t.age > XID_WARNING);

    if (hasXidRisk) {
      const critical = xidData.filter((t) => t.age > XID_CRITICAL);
      if (critical.length > 0) {
        this.logger.error(
          `🚨 XID WRAPAROUND RISK! ${critical.length} tables with age > 1B: ` +
            critical
              .slice(0, 3)
              .map((t) => t.tableName)
              .join(', '),
        );
      }
    }

    return {
      activeVacuums: progressData,
      xidAgeRisk: xidData.filter((t) => t.age > XID_WARNING),
      maxXidAge,
      hasXidRisk,
      databaseAge: autovacuumData.databaseAge,
      databaseFrozenXid: autovacuumData.databaseFrozenXid,
      autovacuum: autovacuumData.stats,
      settings: settingsData,
    };
  }

  private async getVacuumProgress(pool: Pool): Promise<VacuumProgress[]> {
    const versionResult = await pool.query<{ version_num: string }>(
      `SELECT current_setting('server_version_num') AS version_num`,
    );
    const versionNum = parseInt(versionResult.rows[0].version_num, 10);
    const isPg17Plus = versionNum >= 170000;
    const maxDeadCol = isPg17Plus ? 'max_dead_tuple_bytes' : 'max_dead_tuples';
    const numDeadCol = isPg17Plus ? 'num_dead_item_ids' : 'num_dead_tuples';

    const result = await pool.query<{
      pid: number;
      relname: string;
      nspname: string;
      phase: string;
      heap_blks_total: string;
      heap_blks_scanned: string;
      heap_blks_vacuumed: string;
      index_vacuum_count: string;
      max_dead_tuples: string;
      num_dead_tuples: string;
      query: string | null;
    }>(`
      SELECT
        v.pid,
        c.relname,
        n.nspname,
        v.phase,
        v.heap_blks_total,
        v.heap_blks_scanned,
        v.heap_blks_vacuumed,
        v.index_vacuum_count,
        v.${maxDeadCol} AS max_dead_tuples,
        v.${numDeadCol} AS num_dead_tuples,
        a.query
      FROM pg_stat_progress_vacuum v
      JOIN pg_class c     ON c.oid = v.relid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_stat_activity a ON a.pid = v.pid
    `);

    return result.rows.map((row) => {
      const heapBlksTotal = parseInt(row.heap_blks_total, 10);
      const heapBlksScanned = parseInt(row.heap_blks_scanned, 10);
      const progressPct =
        heapBlksTotal > 0
          ? Math.round((heapBlksScanned / heapBlksTotal) * 100)
          : 0;

      return {
        pid: row.pid,
        tableName: row.relname,
        schemaName: row.nspname,
        phase: row.phase,
        heapBlksTotal,
        heapBlksScanned,
        heapBlksVacuumed: parseInt(row.heap_blks_vacuumed, 10),
        indexVacuumCount: parseInt(row.index_vacuum_count, 10),
        maxDeadTuples: parseInt(row.max_dead_tuples, 10),
        numDeadTuples: parseInt(row.num_dead_tuples, 10),
        progressPct,
        isAutovacuum: (row.query ?? '').includes('autovacuum'),
      };
    });
  }

  private async getXidAge(pool: Pool): Promise<XidAgeInfo[]> {
    const result = await pool.query<{
      schema_name: string;
      table_name: string;
      age: string;
      relfrozenxid: string;
    }>(
      `
      SELECT
        n.nspname                           AS schema_name,
        c.relname                           AS table_name,
        -- age() PostgreSQL built-in function
        -- current_xid - relfrozenxid
        -- Bu qiymat qanchalik katta bo'lsa, shunchalik xavfli!
        age(c.relfrozenxid)                 AS age,
        c.relfrozenxid::TEXT                AS relfrozenxid
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE
        c.relkind IN ('r', 't', 'm')   -- r=table, t=TOAST, m=materialized view
        AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
        -- Faqat monitoring uchun muhim (large age)
        AND age(c.relfrozenxid) > $1
      ORDER BY age DESC
      LIMIT 50
    `,
      [XID_WARNING],
    );

    return result.rows.map((row) => {
      const age = parseInt(row.age, 10);
      let ageStatus: XidAgeInfo['ageStatus'] = 'ok';
      if (age >= XID_EMERGENCY) ageStatus = 'emergency';
      else if (age >= XID_CRITICAL) ageStatus = 'critical';
      else if (age >= XID_WARNING) ageStatus = 'warning';

      return {
        schemaName: row.schema_name,
        tableName: row.table_name,
        age,
        relfrozenxid: row.relfrozenxid,
        ageStatus,
      };
    });
  }

  private async getAutovacuumStats(pool: Pool): Promise<{
    databaseAge: number;
    databaseFrozenXid: string;
    stats: AutovacuumStat;
  }> {
    const [dbResult, workersResult] = await Promise.all([
      pool.query<{
        age: string;
        datfrozenxid: string;
      }>(`
        SELECT
          age(datfrozenxid) AS age,
          datfrozenxid::TEXT
        FROM pg_database
        WHERE datname = current_database()
      `),

      pool.query<{
        active_workers: string;
        pending_vacuum: string;
        pending_analyze: string;
      }>(`
        SELECT
          -- Hozir ishlayotgan autovacuum worker'lar
          (SELECT COUNT(*) FROM pg_stat_activity
           WHERE query ILIKE '%autovacuum%') AS active_workers,
          -- Vacuum kutayotgan table'lar (approximation)
          (SELECT COUNT(*) FROM pg_stat_user_tables
           WHERE n_dead_tup > 0) AS pending_vacuum,
          -- Analyze kutayotgan table'lar
          (SELECT COUNT(*) FROM pg_stat_user_tables
           WHERE last_analyze IS NULL OR last_autoanalyze IS NULL) AS pending_analyze
      `),
    ]);

    const maxWorkersStr = await this.getSetting(pool, 'autovacuum_max_workers');

    return {
      databaseAge: parseInt(dbResult.rows[0].age, 10),
      databaseFrozenXid: dbResult.rows[0].datfrozenxid,
      stats: {
        activeWorkers: parseInt(workersResult.rows[0].active_workers, 10),
        maxWorkers: parseInt(maxWorkersStr, 10) || 3,
        tablesPendingVacuum: parseInt(workersResult.rows[0].pending_vacuum, 10),
        tablesPendingAnalyze: parseInt(
          workersResult.rows[0].pending_analyze,
          10,
        ),
        vacuumCount24h: 0,
        analyzeCount24h: 0,
      },
    };
  }

  private async getVacuumSettings(
    pool: Pool,
  ): Promise<VacuumSnapshot['settings']> {
    const result = await pool.query<{ name: string; setting: string }>(`
      SELECT name, setting FROM pg_settings
      WHERE name IN (
        'autovacuum',
        'autovacuum_max_workers',
        'autovacuum_vacuum_threshold',
        'autovacuum_analyze_threshold',
        'vacuum_freeze_max_age',
        'autovacuum_freeze_max_age'
      )
    `);

    const s = Object.fromEntries(result.rows.map((r) => [r.name, r.setting]));

    return {
      autovacuumEnabled: s['autovacuum'] === 'on',
      autovacuumMaxWorkers: parseInt(s['autovacuum_max_workers'] ?? '3', 10),
      autovacuumVacuumThreshold: parseInt(
        s['autovacuum_vacuum_threshold'] ?? '50',
        10,
      ),
      autovacuumAnalyzeThreshold: parseInt(
        s['autovacuum_analyze_threshold'] ?? '50',
        10,
      ),
      vacuumFreezeMaxAge: parseInt(
        s['vacuum_freeze_max_age'] ?? '200000000',
        10,
      ),
      autovacuumFreezeMaxAge: parseInt(
        s['autovacuum_freeze_max_age'] ?? '200000000',
        10,
      ),
    };
  }
}
