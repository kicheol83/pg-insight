jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));

import { Logger } from '@nestjs/common';
import { Client, Pool } from 'pg';
import { LockCollector } from './lock.collector';

const DATABASE_URL = process.env.TEST_TARGET_DATABASE_URL;
const TARGET_ID = '5722600a-0000-4000-8000-000000000000';
const LOCK_KEY = 924_242;

(DATABASE_URL ? describe : describe.skip)(
  'LockCollector against PostgreSQL',
  () => {
    let pool: Pool;
    let blocker: Client;
    let waiter: Client;
    let waiting: Promise<unknown>;
    let blockerPid: number;
    const failedStatements: string[] = [];

    beforeAll(async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      pool = new Pool({ connectionString: DATABASE_URL, max: 3 });
      const query = pool.query.bind(pool) as (
        ...args: unknown[]
      ) => Promise<unknown>;
      (pool as unknown as { query: unknown }).query = (...args: unknown[]) =>
        query(...args).catch((error: Error) => {
          failedStatements.push(error.message);
          throw error;
        });

      blocker = new Client({ connectionString: DATABASE_URL });
      waiter = new Client({ connectionString: DATABASE_URL });
      await Promise.all([blocker.connect(), waiter.connect()]);
      blockerPid = (await blocker.query('SELECT pg_backend_pid() AS pid'))
        .rows[0].pid;
      await blocker.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
      waiting = waiter.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);

      for (let i = 0; i < 50; i++) {
        const { rows } = await blocker.query(
          `SELECT count(*)::int AS n FROM pg_locks
          WHERE locktype = 'advisory' AND NOT granted`,
        );
        if (rows[0].n > 0) break;
        await new Promise((r) => setTimeout(r, 20));
      }
    });

    afterAll(async () => {
      await blocker.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
      await waiting;
      await waiter.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
      await Promise.all([blocker.end(), waiter.end(), pool.end()]);
      jest.restoreAllMocks();
    });

    it('reports the blocking chain without any failing statement', async () => {
      const poolManager = { getPool: () => pool };
      const collector = new LockCollector(poolManager as never);

      const result = await collector.run(TARGET_ID);

      expect(result.meta.success).toBe(true);
      expect(result.data?.hasBlockers).toBe(true);
      expect(result.data?.blockingChains[0]).toMatchObject({
        blockerPid,
      });
      expect(failedStatements).toEqual([]);
    });
  },
);
