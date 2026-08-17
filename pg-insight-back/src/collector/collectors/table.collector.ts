import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { BaseCollector } from '../base.collector';
import { TargetPoolManager } from '../../targets/target-pool.manager';

export interface TableStat {
  schemaName: string;
  tableName: string;
  liveTuples: number;
  deadTuples: number;
  bloatRatio: number;
  seqScans: number;
  idxScans: number;
  seqScanRatio: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsDeleted: number;
  rowsHotUpdated: number;
  tableSizeBytes: number;
  indexSizeBytes: number;
  toastSizeBytes: number;
  totalSizeBytes: number;
  lastVacuum: Date | null;
  lastAutovacuum: Date | null;
  lastAnalyze: Date | null;
  lastAutoAnalyze: Date | null;
  needsVacuum: boolean;
  needsIndex: boolean;
  isUnused: boolean;
  hasVacuumDisabled: boolean;
}

export interface IndexStat {
  schemaName: string;
  tableName: string;
  indexName: string;
  indexSizeBytes: number;
  idxScans: number;
  idxTupRead: number;
  idxTupFetch: number;
  isUnused: boolean;
  isUnique: boolean;
  isPrimary: boolean;
  indexDef: string;
  columns: string[];
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

export interface TableRecommendation {
  type: 'vacuum' | 'analyze' | 'drop_index' | 'add_index' | 'reindex';
  severity: 'info' | 'warning' | 'critical';
  targetName: string;
  message: string;
  command: string;
}

@Injectable()
export class TableCollector extends BaseCollector<TableSnapshot> {
  protected readonly logger = new Logger(TableCollector.name);
  protected readonly name = 'TableCollector';

  private readonly bloatWarningThreshold = 0.2;
  private readonly bloatCriticalThreshold = 0.4;
  private readonly seqScanThreshold = 0.7;
  private readonly minScansForAnalysis = 100;

  constructor(poolManager: TargetPoolManager) {
    super(poolManager);
  }

  protected async collect(
    pool: Pool,
    _targetId: string,
  ): Promise<TableSnapshot> {
    const [tableStats, indexStats] = await Promise.all([
      this.getTableStats(pool),
      this.getIndexStats(pool),
    ]);

    const totalTableSizeBytes = tableStats.reduce(
      (s, t) => s + t.tableSizeBytes,
      0,
    );
    const totalIndexSizeBytes = tableStats.reduce(
      (s, t) => s + t.indexSizeBytes,
      0,
    );
    const tablesNeedingVacuum = tableStats.filter((t) => t.needsVacuum).length;

    const unusedIndexes = indexStats.filter(
      (i) => i.isUnused && !i.isPrimary && !i.isUnique,
    );
    const unusedIndexCount = unusedIndexes.length;
    const unusedIndexSizeBytes = unusedIndexes.reduce(
      (s, i) => s + i.indexSizeBytes,
      0,
    );

    const recommendations = this.generateRecommendations(
      tableStats,
      indexStats,
    );

    return {
      tables: tableStats,
      indexes: indexStats,
      totalTableSizeBytes,
      totalIndexSizeBytes,
      tablesNeedingVacuum,
      unusedIndexCount,
      unusedIndexSizeBytes,
      recommendations,
    };
  }

  private async getTableStats(pool: Pool): Promise<TableStat[]> {
    const result = await pool.query<{
      schema_name: string;
      table_name: string;
      live_tuples: string;
      dead_tuples: string;
      seq_scans: string;
      idx_scans: string;
      rows_inserted: string;
      rows_updated: string;
      rows_deleted: string;
      rows_hot_updated: string;
      table_size_bytes: string;
      index_size_bytes: string;
      toast_size_bytes: string;
      total_size_bytes: string;
      last_vacuum: Date | null;
      last_autovacuum: Date | null;
      last_analyze: Date | null;
      last_autoanalyze: Date | null;
      autovacuum_enabled: boolean;
    }>(`
      SELECT
        s.schemaname                              AS schema_name,
        s.relname                                 AS table_name,

        -- Row counts
        COALESCE(s.n_live_tup, 0)                AS live_tuples,
        COALESCE(s.n_dead_tup, 0)                AS dead_tuples,

        -- Scan counts
        COALESCE(s.seq_scan, 0)                  AS seq_scans,
        COALESCE(s.idx_scan, 0)                  AS idx_scans,

        -- DML counts
        COALESCE(s.n_tup_ins, 0)                 AS rows_inserted,
        COALESCE(s.n_tup_upd, 0)                 AS rows_updated,
        COALESCE(s.n_tup_del, 0)                 AS rows_deleted,
        COALESCE(s.n_tup_hot_upd, 0)             AS rows_hot_updated,

        -- Sizes
        -- pg_relation_size: table heap faqat
        -- pg_indexes_size: barcha indexlar
        -- pg_total_relation_size - pg_relation_size - pg_indexes_size: TOAST
        pg_relation_size(s.relid)                AS table_size_bytes,
        pg_indexes_size(s.relid)                 AS index_size_bytes,
        (pg_total_relation_size(s.relid)
          - pg_relation_size(s.relid)
          - pg_indexes_size(s.relid))            AS toast_size_bytes,
        pg_total_relation_size(s.relid)          AS total_size_bytes,

        -- Vacuum/Analyze timestamps
        s.last_vacuum,
        s.last_autovacuum,
        s.last_analyze,
        s.last_autoanalyze                       AS last_autoanalyze,

        -- Autovacuum enabled?
        -- pg_class.reloptions da autovacuum_enabled=false bo'lishi mumkin
        COALESCE(
          (SELECT CASE
            WHEN option_name = 'autovacuum_enabled' AND option_value = 'false'
            THEN FALSE
            ELSE TRUE END
           FROM pg_options_to_table(c.reloptions)
           WHERE option_name = 'autovacuum_enabled'),
          TRUE
        )                                        AS autovacuum_enabled

      FROM pg_stat_user_tables s
      JOIN pg_class c ON c.oid = s.relid

      WHERE
        -- System schema'larni o'tkazib yuboramiz
        s.schemaname NOT IN (
          'pg_catalog', 'information_schema',
          '_timescaledb_internal', '_timescaledb_catalog',
          'pg_toast'
        )

      ORDER BY
        -- Eng ko'p dead tuple'li table'lar birinchi (vacuum priority)
        s.n_dead_tup DESC NULLS LAST

      LIMIT 200
    `);

    return result.rows.map((row) => {
      const seqScans = parseInt(row.seq_scans, 10);
      const idxScans = parseInt(row.idx_scans, 10);
      const totalScans = seqScans + idxScans;

      const liveTuples = parseInt(row.live_tuples, 10);
      const deadTuples = parseInt(row.dead_tuples, 10);
      const totalTuples = liveTuples + deadTuples;

      const bloatRatio = totalTuples > 0 ? deadTuples / totalTuples : 0;
      const seqScanRatio = totalScans > 0 ? seqScans / totalScans : 0;

      return {
        schemaName: row.schema_name,
        tableName: row.table_name,
        liveTuples,
        deadTuples,
        bloatRatio: Math.round(bloatRatio * 1000) / 1000,
        seqScans,
        idxScans,
        seqScanRatio: Math.round(seqScanRatio * 1000) / 1000,
        rowsInserted: parseInt(row.rows_inserted, 10),
        rowsUpdated: parseInt(row.rows_updated, 10),
        rowsDeleted: parseInt(row.rows_deleted, 10),
        rowsHotUpdated: parseInt(row.rows_hot_updated, 10),
        tableSizeBytes: parseInt(row.table_size_bytes, 10),
        indexSizeBytes: parseInt(row.index_size_bytes, 10),
        toastSizeBytes: parseInt(row.toast_size_bytes, 10),
        totalSizeBytes: parseInt(row.total_size_bytes, 10),
        lastVacuum: row.last_vacuum,
        lastAutovacuum: row.last_autovacuum,
        lastAnalyze: row.last_analyze,
        lastAutoAnalyze: row.last_autoanalyze,
        needsVacuum: bloatRatio > this.bloatWarningThreshold,
        needsIndex:
          seqScanRatio > this.seqScanThreshold &&
          totalScans > this.minScansForAnalysis,
        isUnused: totalScans === 0 && liveTuples === 0,
        hasVacuumDisabled: !row.autovacuum_enabled,
      };
    });
  }

  private async getIndexStats(pool: Pool): Promise<IndexStat[]> {
    const result = await pool.query<{
      schema_name: string;
      table_name: string;
      index_name: string;
      index_size_bytes: string;
      idx_scans: string;
      idx_tup_read: string;
      idx_tup_fetch: string;
      is_unique: boolean;
      is_primary: boolean;
      index_def: string;
      columns: string;
    }>(`
      SELECT
        n.nspname                           AS schema_name,
        c.relname                           AS table_name,
        i.relname                           AS index_name,
        pg_relation_size(ix.indexrelid)     AS index_size_bytes,
        COALESCE(s.idx_scan, 0)             AS idx_scans,
        COALESCE(s.idx_tup_read, 0)        AS idx_tup_read,
        COALESCE(s.idx_tup_fetch, 0)       AS idx_tup_fetch,
        ix.indisunique                      AS is_unique,
        ix.indisprimary                     AS is_primary,
        pg_get_indexdef(ix.indexrelid)      AS index_def,
        -- Column names (array_agg)
        STRING_AGG(
          a.attname,
          ', '
          ORDER BY array_position(ix.indkey, a.attnum)
        )                                   AS columns
      FROM pg_index ix
      JOIN pg_class c   ON c.oid   = ix.indrelid
      JOIN pg_class i   ON i.oid   = ix.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_stat_user_indexes s
        ON s.indexrelid = ix.indexrelid
      LEFT JOIN pg_attribute a
        ON a.attrelid = ix.indrelid
        AND a.attnum = ANY(ix.indkey)
        AND a.attnum > 0
      WHERE
        n.nspname NOT IN (
          'pg_catalog', 'information_schema',
          '_timescaledb_internal', 'pg_toast'
        )
        AND NOT ix.indisexclusion   -- exclusion constraint
      GROUP BY
        n.nspname, c.relname, i.relname, ix.indexrelid,
        ix.indisunique, ix.indisprimary, s.idx_scan,
        s.idx_tup_read, s.idx_tup_fetch
      ORDER BY
        s.idx_scan ASC NULLS FIRST,  -- 0 scan'li indexlar birinchi
        pg_relation_size(ix.indexrelid) DESC  -- keyin kattasi birinchi
    `);

    return result.rows.map((row) => ({
      schemaName: row.schema_name,
      tableName: row.table_name,
      indexName: row.index_name,
      indexSizeBytes: parseInt(row.index_size_bytes, 10),
      idxScans: parseInt(row.idx_scans, 10),
      idxTupRead: parseInt(row.idx_tup_read, 10),
      idxTupFetch: parseInt(row.idx_tup_fetch, 10),
      isUnused: parseInt(row.idx_scans, 10) === 0,
      isUnique: row.is_unique,
      isPrimary: row.is_primary,
      indexDef: row.index_def,
      columns: row.columns ? row.columns.split(', ') : [],
    }));
  }

  private generateRecommendations(
    tables: TableStat[],
    indexes: IndexStat[],
  ): TableRecommendation[] {
    const recs: TableRecommendation[] = [];

    for (const t of tables) {
      const fullName = `${t.schemaName}.${t.tableName}`;

      if (t.bloatRatio >= this.bloatCriticalThreshold) {
        recs.push({
          type: 'vacuum',
          severity: 'critical',
          targetName: fullName,
          message: `Table has ${(t.bloatRatio * 100).toFixed(0)}% dead tuples — immediate VACUUM needed`,
          command: `VACUUM ANALYZE ${fullName};`,
        });
      } else if (t.bloatRatio >= this.bloatWarningThreshold) {
        recs.push({
          type: 'vacuum',
          severity: 'warning',
          targetName: fullName,
          message: `Table has ${(t.bloatRatio * 100).toFixed(0)}% dead tuples`,
          command: `VACUUM ${fullName};`,
        });
      }

      if (t.hasVacuumDisabled) {
        recs.push({
          type: 'vacuum',
          severity: 'warning',
          targetName: fullName,
          message: 'Autovacuum is disabled for this table',
          command: `ALTER TABLE ${fullName} RESET (autovacuum_enabled);`,
        });
      }

      if (t.needsIndex && t.liveTuples > 1000) {
        recs.push({
          type: 'add_index',
          severity: 'warning',
          targetName: fullName,
          message: `High sequential scan ratio (${(t.seqScanRatio * 100).toFixed(0)}%) with ${t.liveTuples.toLocaleString()} rows`,
          command: `-- Analyze with EXPLAIN ANALYZE to find missing index\nEXPLAIN ANALYZE SELECT ... FROM ${fullName} WHERE <your_filter>;`,
        });
      }
    }

    for (const idx of indexes) {
      if (idx.isUnused && !idx.isPrimary && !idx.isUnique) {
        const fullName = `${idx.schemaName}.${idx.indexName}`;
        recs.push({
          type: 'drop_index',
          severity: 'info',
          targetName: fullName,
          message: `Index has never been used (${(idx.indexSizeBytes / 1024 / 1024).toFixed(1)} MB wasted)`,
          command: `-- Verify before dropping!\nDROP INDEX CONCURRENTLY ${fullName};`,
        });
      }
    }

    const severityOrder = { critical: 0, warning: 1, info: 2 };
    return recs.sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
    );
  }
}
