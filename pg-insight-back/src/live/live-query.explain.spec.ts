jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import { Pool } from 'pg';
import { LiveQueryService } from './live-query.service';

const DATABASE_URL = process.env.TEST_TARGET_DATABASE_URL;

(DATABASE_URL ? describe : describe.skip)(
  'LiveQueryService.explainQuery against PostgreSQL',
  () => {
    let pool: Pool;
    let service: LiveQueryService;

    beforeAll(() => {
      pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
      service = new LiveQueryService(
        { getPool: () => pool } as never,
        {} as never,
      );
    });

    afterAll(async () => {
      await pool.end();
    });

    it('stops a runaway EXPLAIN ANALYZE at the statement timeout', async () => {
      const started = Date.now();

      await expect(
        service.explainQuery(
          'target-1',
          'SELECT count(*) FROM generate_series(1, 10000000000)',
          true,
        ),
      ).rejects.toThrow('Query exceeded the 5s EXPLAIN time limit');

      expect(Date.now() - started).toBeLessThan(8_000);
    }, 15_000);

    it('does not leak the timeouts to the pooled connection', async () => {
      await service.explainQuery('target-1', 'SELECT 1', true);

      const { rows } = await pool.query<{ statement_timeout: string }>(
        'SHOW statement_timeout',
      );
      const lock = await pool.query<{ lock_timeout: string }>(
        'SHOW lock_timeout',
      );

      expect(rows[0].statement_timeout).toBe('0');
      expect(lock.rows[0].lock_timeout).toBe('0');
    });

    it('plans without executing when analyze is not requested', async () => {
      const started = Date.now();

      const result = await service.explainQuery(
        'target-1',
        'SELECT count(*) FROM generate_series(1, 10000000000)',
      );

      expect(result.analyzed).toBe(false);
      expect(JSON.stringify(result.plan)).not.toContain('Actual Total Time');
      expect(Date.now() - started).toBeLessThan(2_000);
    });
  },
);
