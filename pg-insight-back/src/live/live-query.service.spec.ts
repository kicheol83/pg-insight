import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LiveQueryService } from './live-query.service';
import { TargetPoolManager } from '../targets/target-pool.manager';

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
      if (sql.includes('pg_extension')) return [{ exists: false }];
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
