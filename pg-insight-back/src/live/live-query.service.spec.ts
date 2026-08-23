import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LiveQueryService } from './live-query.service';
import { TargetPoolManager } from '../targets/target-pool.manager';
import { PrismaService } from '../database/prisma.service';

const mockPrismaProvider = { provide: PrismaService, useValue: {} };

describe('LiveQueryService', () => {
  let service: LiveQueryService;
  let poolManager: {
    query: jest.Mock;
    getEntry: jest.Mock;
    getPool: jest.Mock;
  };
  let mockClient: { query: jest.Mock; release: jest.Mock };

  beforeEach(async () => {
    mockClient = { query: jest.fn(), release: jest.fn() };
    poolManager = {
      query: jest.fn(),
      getEntry: jest.fn(),
      getPool: jest
        .fn()
        .mockReturnValue({ connect: jest.fn().mockResolvedValue(mockClient) }),
    };

    const module = await Test.createTestingModule({
      providers: [
        LiveQueryService,
        { provide: TargetPoolManager, useValue: poolManager },
        mockPrismaProvider,
      ],
    }).compile();

    service = module.get(LiveQueryService);
  });

  function mockSuccessfulExplain() {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ 'QUERY PLAN': { Plan: {} } }] }) // EXPLAIN
      .mockResolvedValueOnce(undefined); // ROLLBACK
  }

  describe('explainQuery — xavfsizlik filtri', () => {
    it('allows a plain SELECT query and runs it inside a READ ONLY transaction', async () => {
      mockSuccessfulExplain();
      const result = await service.explainQuery(
        'target-1',
        'SELECT * FROM users',
      );

      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(mockClient.query).toHaveBeenNthCalledWith(
        1,
        'BEGIN TRANSACTION READ ONLY',
      );
      expect(mockClient.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM users',
        ),
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('allows a WITH (CTE) query', async () => {
      mockSuccessfulExplain();
      await expect(
        service.explainQuery(
          'target-1',
          'WITH t AS (SELECT 1) SELECT * FROM t',
        ),
      ).resolves.toBeDefined();
    });

    it('rejects INSERT before ever touching the database', async () => {
      await expect(
        service.explainQuery(
          'target-1',
          "INSERT INTO users (name) VALUES ('x')",
        ),
      ).rejects.toThrow(BadRequestException);
      expect(poolManager.getPool).not.toHaveBeenCalled();
    });

    it('rejects UPDATE', async () => {
      await expect(
        service.explainQuery('target-1', "UPDATE users SET name = 'x'"),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects DELETE', async () => {
      await expect(
        service.explainQuery('target-1', 'DELETE FROM users'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects multiple statements (DROP smuggled after a semicolon)', async () => {
      await expect(
        service.explainQuery('target-1', 'SELECT 1; DROP TABLE users;'),
      ).rejects.toThrow(BadRequestException);
      expect(poolManager.getPool).not.toHaveBeenCalled();
    });

    it('rejects a DROP keyword hidden inside a SQL comment trick', async () => {
      await expect(
        service.explainQuery(
          'target-1',
          'SELECT 1; DR/*hidden*/OP TABLE users;',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects queries that do not start with SELECT or WITH', async () => {
      await expect(
        service.explainQuery('target-1', 'TRUNCATE users'),
      ).rejects.toThrow(BadRequestException);
    });

    it('strips a trailing semicolon before running', async () => {
      mockSuccessfulExplain();
      await service.explainQuery('target-1', 'SELECT 1;');
      expect(mockClient.query).toHaveBeenNthCalledWith(
        2,
        expect.not.stringMatching(/;\s*$/),
      );
    });

    it('translates a Postgres read-only-transaction error into a friendly message', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(
          new Error('cannot execute UPDATE in a read-only transaction'),
        )
        .mockResolvedValueOnce(undefined); // ROLLBACK (in catch)

      await expect(
        service.explainQuery('target-1', 'SELECT * FROM users'),
      ).rejects.toThrow(/only read-only queries are allowed/);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('always releases the client even on unexpected errors', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('connection reset'))
        .mockResolvedValueOnce(undefined);

      await expect(
        service.explainQuery('target-1', 'SELECT 1'),
      ).rejects.toThrow('connection reset');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('getSlowQueries', () => {
    it('returns empty list with a message when pg_stat_statements is not installed', async () => {
      poolManager.getEntry.mockReturnValue({ hasStatStatements: false });
      const result = await service.getSlowQueries('target-1');
      expect(result.queries).toEqual([]);
      expect(result.message).toMatch(/pg_stat_statements/);
      expect(poolManager.query).not.toHaveBeenCalled();
    });

    it('tags a query as very-slow when mean time exceeds 10s', async () => {
      poolManager.getEntry.mockReturnValue({ hasStatStatements: true });
      poolManager.query
        .mockResolvedValueOnce([{ total: '1' }])
        .mockResolvedValueOnce([
          {
            query_id: '123',
            query_text: 'SELECT * FROM big_table',
            calls: 5,
            total_time_ms: 60000,
            mean_time_ms: 12000,
            max_time_ms: 15000,
            stddev_time_ms: 100,
            rows_per_call: 10,
            cache_hit_ratio: 0.99,
          },
        ]);
      const result = await service.getSlowQueries('target-1');
      expect(result.queries[0].tags).toContain('very-slow');
      expect(result.total).toBe(1);
    });

    it('tags a write-heavy query correctly', async () => {
      poolManager.getEntry.mockReturnValue({ hasStatStatements: true });
      poolManager.query
        .mockResolvedValueOnce([{ total: '1' }])
        .mockResolvedValueOnce([
          {
            query_id: '456',
            query_text: 'UPDATE accounts SET balance = balance - 1',
            calls: 100,
            total_time_ms: 500,
            mean_time_ms: 5,
            max_time_ms: 20,
            stddev_time_ms: 2,
            rows_per_call: 1,
            cache_hit_ratio: 1,
          },
        ]);
      const result = await service.getSlowQueries('target-1');
      expect(result.queries[0].tags).toContain('write-heavy');
    });

    it('passes limit and offset through to the query', async () => {
      poolManager.getEntry.mockReturnValue({ hasStatStatements: true });
      poolManager.query
        .mockResolvedValueOnce([{ total: '0' }])
        .mockResolvedValueOnce([]);
      await service.getSlowQueries('target-1', 10, 20);
      expect(poolManager.query).toHaveBeenNthCalledWith(
        2,
        'target-1',
        expect.stringContaining('LIMIT $1 OFFSET $2'),
        [10, 20],
      );
    });
  });

  describe('cancelQuery', () => {
    it('calls pg_cancel_backend with the given pid', async () => {
      poolManager.query.mockResolvedValue([]);
      const result = await service.cancelQuery('target-1', 12345);
      expect(result).toEqual({ cancelled: true, pid: 12345 });
      expect(poolManager.query).toHaveBeenCalledWith(
        'target-1',
        expect.stringContaining('pg_cancel_backend'),
        [12345],
      );
    });
  });
});

describe('LiveQueryService — getDiagnostics', () => {
  let service: LiveQueryService;
  let poolManager: {
    query: jest.Mock;
    getEntry: jest.Mock;
    getPool: jest.Mock;
  };

  beforeEach(async () => {
    poolManager = {
      query: jest.fn(),
      getEntry: jest
        .fn()
        .mockReturnValue({ username: 'monitor_user', pgVersion: '16.1' }),
      getPool: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        LiveQueryService,
        { provide: TargetPoolManager, useValue: poolManager },
        mockPrismaProvider,
      ],
    }).compile();
    service = module.get(LiveQueryService);
  });

  it('reports overallStatus healthy when every check passes', async () => {
    poolManager.query.mockImplementation(async (_id: string, sql: string) => {
      if (sql.includes('server_version_num'))
        return [{ version_num: '160001' }];
      if (sql.includes('pg_extension')) return [{ exists: true }];
      return [];
    });

    const report = await service.getDiagnostics('target-1');

    expect(report.overallStatus).toBe('healthy');
    expect(report.checks.every((c) => c.status === 'ok')).toBe(true);
  });

  it('reports overallStatus broken and stops early when connectivity fails', async () => {
    poolManager.query.mockRejectedValue(new Error('ECONNREFUSED'));

    const report = await service.getDiagnostics('target-1');

    expect(report.overallStatus).toBe('broken');
    expect(report.checks).toHaveLength(1);
    expect(report.checks[0].id).toBe('connectivity');
    expect(report.checks[0].status).toBe('error');
  });

  it('reports overallStatus degraded when only warnings are present', async () => {
    poolManager.query.mockImplementation(async (_id: string, sql: string) => {
      if (sql.includes('server_version_num'))
        return [{ version_num: '160001' }];
      if (sql.includes('pg_extension')) return [{ exists: false }]; // warning: missing extension
      return [];
    });

    const report = await service.getDiagnostics('target-1');

    expect(report.overallStatus).toBe('degraded');
    const statementsCheck = report.checks.find(
      (c) => c.id === 'pg_stat_statements',
    );
    expect(statementsCheck?.status).toBe('warning');
    expect(statementsCheck?.fixCommand).toContain('CREATE EXTENSION');
  });

  it('marks pg_stat_activity as a critical error with a grant command when permission is denied', async () => {
    poolManager.query.mockImplementation(async (_id: string, sql: string) => {
      if (sql.includes('server_version_num'))
        return [{ version_num: '160001' }];
      if (sql.includes('pg_extension')) return [{ exists: true }];
      if (sql.includes('pg_stat_activity'))
        throw new Error('permission denied for pg_stat_activity');
      return [];
    });

    const report = await service.getDiagnostics('target-1');

    const check = report.checks.find((c) => c.id === 'pg_stat_activity');
    expect(check?.status).toBe('error');
    expect(check?.fixCommand).toBe('GRANT pg_monitor TO monitor_user;');
    expect(report.overallStatus).toBe('broken');
  });

  it('includes the detected username in the grant command', async () => {
    poolManager.getEntry.mockReturnValue({
      username: 'custom_readonly',
      pgVersion: '15.0',
    });
    poolManager.query.mockImplementation(async (_id: string, sql: string) => {
      if (sql.includes('pg_locks')) throw new Error('permission denied');
      if (sql.includes('server_version_num'))
        return [{ version_num: '150000' }];
      if (sql.includes('pg_extension')) return [{ exists: true }];
      return [];
    });

    const report = await service.getDiagnostics('target-1');
    const check = report.checks.find((c) => c.id === 'pg_locks');
    expect(check?.fixCommand).toBe('GRANT pg_monitor TO custom_readonly;');
  });
});

describe('LiveQueryService — getDatabaseStats', () => {
  let service: LiveQueryService;
  let poolManager: {
    query: jest.Mock;
    getEntry: jest.Mock;
    getPool: jest.Mock;
  };

  beforeEach(async () => {
    poolManager = { query: jest.fn(), getEntry: jest.fn(), getPool: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        LiveQueryService,
        { provide: TargetPoolManager, useValue: poolManager },
        mockPrismaProvider,
      ],
    }).compile();
    service = module.get(LiveQueryService);
  });

  it('computes cache hit ratio and commit ratio correctly', async () => {
    poolManager.query
      .mockResolvedValueOnce([
        {
          name: 'app_production',
          num_backends: 12,
          xact_commit: 900,
          xact_rollback: 100,
          blks_read: 50,
          blks_hit: 950,
          tup_returned: 1000,
          tup_fetched: 800,
          tup_inserted: 10,
          tup_updated: 5,
          tup_deleted: 2,
          conflicts: 0,
          temp_files: 3,
          temp_bytes: 1024000,
          deadlocks: 1,
          checksum_failures: 0,
          blk_read_time: 12.5,
          blk_write_time: 4.2,
          stats_reset: '2026-01-01T00:00:00Z',
        },
      ])
      .mockResolvedValueOnce([{ setting: 'on' }]);

    const result = await service.getDatabaseStats('target-1');

    expect(result.databases[0].cacheHitRatio).toBeCloseTo(0.95);
    expect(result.databases[0].commitRatio).toBeCloseTo(0.9);
    expect(result.databases[0].deadlocks).toBe(1);
    expect(result.databases[0].tempFiles).toBe(3);
    expect(result.trackIoTimingEnabled).toBe(true);
  });

  it('defaults ratios to 1 (100%) when there is no activity yet — avoids NaN/divide-by-zero', async () => {
    poolManager.query
      .mockResolvedValueOnce([
        {
          name: 'fresh_db',
          num_backends: 0,
          xact_commit: 0,
          xact_rollback: 0,
          blks_read: 0,
          blks_hit: 0,
          tup_returned: 0,
          tup_fetched: 0,
          tup_inserted: 0,
          tup_updated: 0,
          tup_deleted: 0,
          conflicts: 0,
          temp_files: 0,
          temp_bytes: 0,
          deadlocks: 0,
          checksum_failures: 0,
          blk_read_time: 0,
          blk_write_time: 0,
          stats_reset: null,
        },
      ])
      .mockResolvedValueOnce([{ setting: 'off' }]);

    const result = await service.getDatabaseStats('target-1');

    expect(result.databases[0].cacheHitRatio).toBe(1);
    expect(result.databases[0].commitRatio).toBe(1);
    expect(result.trackIoTimingEnabled).toBe(false);
  });

  it('returns one row per non-template database', async () => {
    poolManager.query
      .mockResolvedValueOnce([
        {
          name: 'db1',
          num_backends: 1,
          xact_commit: 1,
          xact_rollback: 0,
          blks_read: 1,
          blks_hit: 1,
          tup_returned: 0,
          tup_fetched: 0,
          tup_inserted: 0,
          tup_updated: 0,
          tup_deleted: 0,
          conflicts: 0,
          temp_files: 0,
          temp_bytes: 0,
          deadlocks: 0,
          checksum_failures: 0,
          blk_read_time: 0,
          blk_write_time: 0,
          stats_reset: null,
        },
        {
          name: 'db2',
          num_backends: 2,
          xact_commit: 1,
          xact_rollback: 0,
          blks_read: 1,
          blks_hit: 1,
          tup_returned: 0,
          tup_fetched: 0,
          tup_inserted: 0,
          tup_updated: 0,
          tup_deleted: 0,
          conflicts: 0,
          temp_files: 0,
          temp_bytes: 0,
          deadlocks: 0,
          checksum_failures: 0,
          blk_read_time: 0,
          blk_write_time: 0,
          stats_reset: null,
        },
      ])
      .mockResolvedValueOnce([{ setting: 'on' }]);

    const result = await service.getDatabaseStats('target-1');
    expect(result.databases).toHaveLength(2);
    expect(result.databases.map((d) => d.name)).toEqual(['db1', 'db2']);
  });
});

describe('LiveQueryService — getIoStats', () => {
  let service: LiveQueryService;
  let poolManager: {
    query: jest.Mock;
    getEntry: jest.Mock;
    getPool: jest.Mock;
  };

  beforeEach(async () => {
    poolManager = { query: jest.fn(), getEntry: jest.fn(), getPool: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        LiveQueryService,
        { provide: TargetPoolManager, useValue: poolManager },
        mockPrismaProvider,
      ],
    }).compile();
    service = module.get(LiveQueryService);
  });

  it('uses pg_stat_io on PostgreSQL 16+', async () => {
    poolManager.getEntry.mockReturnValue({ pgVersionNum: 160001 });
    poolManager.query
      .mockResolvedValueOnce([{ setting: 'on' }]) // track_io_timing
      .mockResolvedValueOnce([
        {
          backend_type: 'client backend',
          object: 'relation',
          context: 'normal',
          reads: 100,
          writes: 20,
          extends: 5,
          hits: 900,
          evictions: 3,
          reuses: 1,
          fsyncs: 0,
          read_time: 12,
          write_time: 3,
          extend_time: 1,
          fsync_time: 0,
        },
        {
          backend_type: 'autovacuum worker',
          object: 'relation',
          context: 'vacuum',
          reads: 50,
          writes: 10,
          extends: 0,
          hits: 100,
          evictions: 10,
          reuses: 5,
          fsyncs: 0,
          read_time: 5,
          write_time: 2,
          extend_time: 0,
          fsync_time: 0,
        },
      ]);

    const result = await service.getIoStats('target-1');

    expect(result.source).toBe('pg_stat_io');
    expect(result.pgStatIoAvailable).toBe(true);
    expect(result.rows).toHaveLength(2);
    expect(result.byBackendType).toBeDefined();
    expect(result.byBackendType![0].backendType).toBe('client backend');
  });

  it('falls back to pg_statio_user_tables on PostgreSQL versions older than 16', async () => {
    poolManager.getEntry.mockReturnValue({ pgVersionNum: 150000 });
    poolManager.query
      .mockResolvedValueOnce([{ setting: 'off' }]) // track_io_timing
      .mockResolvedValueOnce([
        {
          heap_blks_read: 100,
          heap_blks_hit: 900,
          idx_blks_read: 50,
          idx_blks_hit: 450,
          toast_blks_read: 0,
          toast_blks_hit: 0,
        },
      ]);

    const result = await service.getIoStats('target-1');

    expect(result.source).toBe('pg_statio_fallback');
    expect(result.pgStatIoAvailable).toBe(false);
    expect(result.fallback).toBeDefined();
    // (900+450) hit / (150+1350) total = 1350/1500 = 0.9
    expect(result.fallback!.cacheHitRatio).toBeCloseTo(0.9);
  });

  it('falls back gracefully even on PG16+ if pg_stat_io query itself fails', async () => {
    poolManager.getEntry.mockReturnValue({ pgVersionNum: 160001 });
    poolManager.query
      .mockResolvedValueOnce([{ setting: 'on' }]) // track_io_timing
      .mockRejectedValueOnce(new Error('permission denied for view pg_stat_io'))
      .mockResolvedValueOnce([
        {
          // fallback query
          heap_blks_read: 10,
          heap_blks_hit: 90,
          idx_blks_read: 0,
          idx_blks_hit: 0,
          toast_blks_read: 0,
          toast_blks_hit: 0,
        },
      ]);

    const result = await service.getIoStats('target-1');

    expect(result.source).toBe('pg_statio_fallback');
  });

  it('does not attempt pg_stat_io at all when version is unknown (defensive default)', async () => {
    poolManager.getEntry.mockReturnValue(null); // getEntry returns null — no version info
    poolManager.query
      .mockResolvedValueOnce([{ setting: 'off' }])
      .mockResolvedValueOnce([
        {
          heap_blks_read: 0,
          heap_blks_hit: 0,
          idx_blks_read: 0,
          idx_blks_hit: 0,
          toast_blks_read: 0,
          toast_blks_hit: 0,
        },
      ]);

    const result = await service.getIoStats('target-1');
    expect(result.source).toBe('pg_statio_fallback');
  });
});

describe('LiveQueryService — getJobProgress', () => {
  let service: LiveQueryService;
  let poolManager: {
    query: jest.Mock;
    getEntry: jest.Mock;
    getPool: jest.Mock;
  };

  beforeEach(async () => {
    poolManager = { query: jest.fn(), getEntry: jest.fn(), getPool: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        LiveQueryService,
        { provide: TargetPoolManager, useValue: poolManager },
        mockPrismaProvider,
      ],
    }).compile();
    service = module.get(LiveQueryService);
  });

  it('aggregates all four progress types when everything succeeds', async () => {
    poolManager.query
      .mockResolvedValueOnce([
        {
          pid: 1,
          table_name: 't1',
          schema_name: 'public',
          command: 'CREATE INDEX CONCURRENTLY',
          phase: 'building index',
          blocks_total: 1000,
          blocks_done: 400,
          tuples_total: 0,
          tuples_done: 0,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          pid: 2,
          table_name: 't2',
          schema_name: 'public',
          command: 'COPY FROM',
          type: 'file',
          bytes_processed: 500,
          bytes_total: 1000,
          tuples_processed: 10,
          tuples_excluded: 0,
        },
      ]);

    const result = await service.getJobProgress('target-1');

    expect(result.createIndex).toHaveLength(1);
    expect(result.createIndex[0].progressPct).toBeCloseTo(40);
    expect(result.copy).toHaveLength(1);
    expect(result.copy[0].progressPct).toBeCloseTo(50);
    expect(result.cluster).toHaveLength(0);
    expect(result.analyze).toHaveLength(0);
    expect(result.totalActive).toBe(2);
  });

  it('returns empty arrays for views that do not exist on older PostgreSQL, without failing the whole request', async () => {
    poolManager.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(
        new Error('relation "pg_stat_progress_analyze" does not exist'),
      ) // PG12'da yo'q
      .mockRejectedValueOnce(
        new Error('relation "pg_stat_progress_copy" does not exist'),
      ); // PG12'da yo'q

    const result = await service.getJobProgress('target-1');

    expect(result.analyze).toEqual([]);
    expect(result.copy).toEqual([]);
    expect(result.totalActive).toBe(0);
  });

  it('handles a mix of one succeeding and three failing progress views', async () => {
    poolManager.query
      .mockResolvedValueOnce([
        {
          pid: 5,
          table_name: 'big_table',
          schema_name: 'public',
          command: 'CLUSTER',
          phase: 'seq scanning heap',
          heap_tuples_scanned: 500,
          heap_tuples_written: 500,
          heap_blks_total: 2000,
          heap_blks_scanned: 1000,
        },
      ])
      .mockRejectedValueOnce(new Error('permission denied'))
      .mockRejectedValueOnce(new Error('permission denied'))
      .mockRejectedValueOnce(new Error('permission denied'));

    const result = await service.getJobProgress('target-1');
    const totalRows =
      result.createIndex.length +
      result.cluster.length +
      result.analyze.length +
      result.copy.length;
    expect(totalRows).toBeLessThanOrEqual(1);
  });
});

describe('LiveQueryService — getHealthScore', () => {
  let service: LiveQueryService;
  let poolManager: {
    query: jest.Mock;
    getEntry: jest.Mock;
    getPool: jest.Mock;
  };
  let backupModel: { findFirst: jest.Mock };

  beforeEach(async () => {
    poolManager = { query: jest.fn(), getEntry: jest.fn(), getPool: jest.fn() };
    backupModel = { findFirst: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        LiveQueryService,
        { provide: TargetPoolManager, useValue: poolManager },
        { provide: PrismaService, useValue: { backup: backupModel } },
      ],
    }).compile();

    service = module.get(LiveQueryService);
  });

  function mockAllHealthy() {
    poolManager.query.mockImplementation(async (_id: string, sql: string) => {
      // getVacuumProgress ichidagi so'rovlar
      if (sql.includes('pg_stat_progress_vacuum')) return [];
      if (
        sql.includes("nspname NOT IN ('pg_catalog'") &&
        sql.includes('age(c.relfrozenxid)')
      )
        return [];
      if (sql.includes('age(datfrozenxid)')) return [{ age: '50000000' }];
      if (sql.includes("name IN ('autovacuum'"))
        return [{ name: 'autovacuum', setting: 'on' }];
      if (sql.includes("query ILIKE 'autovacuum%'")) return [{ cnt: '0' }];
      // getTableStats
      if (sql.includes('pg_stat_user_tables')) return [];
      if (sql.includes('reloptions')) return [];
      if (sql.includes('pg_stat_user_indexes')) return [];
      // getDatabaseStats
      if (sql.includes('pg_stat_database'))
        return [
          {
            name: 'app',
            num_backends: 5,
            xact_commit: 1000,
            xact_rollback: 5,
            blks_read: 10,
            blks_hit: 9990,
            tup_returned: 0,
            tup_fetched: 0,
            tup_inserted: 0,
            tup_updated: 0,
            tup_deleted: 0,
            conflicts: 0,
            temp_files: 0,
            temp_bytes: 0,
            deadlocks: 0,
            checksum_failures: 0,
            blk_read_time: 0,
            blk_write_time: 0,
            stats_reset: null,
          },
        ];
      if (sql.includes("name = 'track_io_timing'")) return [{ setting: 'on' }];
      // getReplication
      if (sql.includes('pg_is_in_recovery')) return [{ is_recovery: false }];
      if (sql.includes('pg_current_wal_lsn') && sql.includes('0/0'))
        return [{ size: '0' }];
      if (sql.includes('pg_stat_replication')) return [];
      if (sql.includes('pg_replication_slots')) return [];
      // getConnections
      if (
        sql.includes('pg_stat_activity') &&
        sql.includes('pid != pg_backend_pid()')
      )
        return [];
      if (sql.includes('max_connections')) return [{ max_connections: '100' }];
      return [];
    });
    backupModel.findFirst.mockResolvedValue({ completedAt: new Date() });
  }

  it('returns a perfect-ish score when every factor is healthy', async () => {
    mockAllHealthy();
    const report = await service.getHealthScore('target-1');

    expect(report.score).toBeGreaterThanOrEqual(90);
    expect(report.grade).toBe('excellent');
    expect(report.factors.every((f) => f.status === 'ok')).toBe(true);
  });

  it('deducts heavily and grades "poor" when XID age is at emergency level', async () => {
    mockAllHealthy();
    poolManager.query.mockImplementation(async (_id: string, sql: string) => {
      if (sql.includes('age(datfrozenxid)')) return [{ age: '1800000000' }]; // 1.8B — emergency
      if (sql.includes('pg_stat_progress_vacuum')) return [];
      if (sql.includes('age(c.relfrozenxid)')) return [];
      if (sql.includes("name IN ('autovacuum'"))
        return [{ name: 'autovacuum', setting: 'on' }];
      if (sql.includes("query ILIKE 'autovacuum%'")) return [{ cnt: '0' }];
      return [];
    });

    const report = await service.getHealthScore('target-1');

    const xidFactor = report.factors.find((f) => f.id === 'xid_age')!;
    expect(xidFactor.status).toBe('critical');
    expect(xidFactor.impact).toBe(-25);
    expect(report.score).toBeLessThanOrEqual(75);
  });

  it('deducts points and warns when no backup has ever been taken', async () => {
    mockAllHealthy();
    backupModel.findFirst.mockResolvedValue(null);

    const report = await service.getHealthScore('target-1');

    const backupFactor = report.factors.find(
      (f) => f.id === 'backup_freshness',
    )!;
    expect(backupFactor.status).toBe('warning');
    expect(backupFactor.detail).toContain('Hech qachon');
    expect(report.score).toBeLessThan(100);
  });

  it('deducts fewer points for a backup that is stale (>7 days) than for no backup at all', async () => {
    mockAllHealthy();
    backupModel.findFirst.mockResolvedValue({
      completedAt: new Date(Date.now() - 10 * 24 * 3600_000),
    });

    const report = await service.getHealthScore('target-1');
    const backupFactor = report.factors.find(
      (f) => f.id === 'backup_freshness',
    )!;
    expect(backupFactor.status).toBe('warning');
    expect(backupFactor.impact).toBe(-10);
  });

  it('never lets the score go below 0 even with many simultaneous critical factors', async () => {
    poolManager.query.mockImplementation(async (_id: string, sql: string) => {
      if (sql.includes('age(datfrozenxid)')) return [{ age: '1900000000' }];
      if (sql.includes('pg_stat_database'))
        return [
          {
            name: 'app',
            num_backends: 5,
            xact_commit: 100,
            xact_rollback: 5,
            blks_read: 9000,
            blks_hit: 1000,
            tup_returned: 0,
            tup_fetched: 0,
            tup_inserted: 0,
            tup_updated: 0,
            tup_deleted: 0,
            conflicts: 0,
            temp_files: 0,
            temp_bytes: 0,
            deadlocks: 0,
            checksum_failures: 0,
            blk_read_time: 0,
            blk_write_time: 0,
            stats_reset: null,
          },
        ];
      if (sql.includes('max_connections')) return [{ max_connections: '10' }];
      if (
        sql.includes('pg_stat_activity') &&
        sql.includes('pid != pg_backend_pid()')
      ) {
        return Array.from({ length: 10 }, (_, i) => ({
          pid: i,
          username: 'u',
          application_name: '',
          client_addr: null,
          db_name: 'app',
          state: 'active',
          wait_event_type: null,
          wait_event: null,
          query_duration_ms: 0,
          xact_duration_ms: 0,
          query: null,
          backend_type: 'client backend',
        }));
      }
      return [];
    });
    backupModel.findFirst.mockResolvedValue(null);

    const report = await service.getHealthScore('target-1');

    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.grade).toBe('poor');
  });

  it('does not crash the whole score when one sub-check (e.g. replication) fails entirely', async () => {
    mockAllHealthy();
    poolManager.query.mockImplementation(async (_id: string, sql: string) => {
      if (sql.includes('pg_is_in_recovery'))
        throw new Error('connection reset');
      if (sql.includes('age(datfrozenxid)')) return [{ age: '50000000' }];
      if (sql.includes('pg_stat_database'))
        return [
          {
            name: 'app',
            num_backends: 5,
            xact_commit: 1000,
            xact_rollback: 5,
            blks_read: 10,
            blks_hit: 9990,
            tup_returned: 0,
            tup_fetched: 0,
            tup_inserted: 0,
            tup_updated: 0,
            tup_deleted: 0,
            conflicts: 0,
            temp_files: 0,
            temp_bytes: 0,
            deadlocks: 0,
            checksum_failures: 0,
            blk_read_time: 0,
            blk_write_time: 0,
            stats_reset: null,
          },
        ];
      if (sql.includes('max_connections')) return [{ max_connections: '100' }];
      return [];
    });

    const report = await service.getHealthScore('target-1');

    expect(report.factors.find((f) => f.id === 'xid_age')).toBeDefined();
    expect(report.score).toBeGreaterThan(0);
  });
});
