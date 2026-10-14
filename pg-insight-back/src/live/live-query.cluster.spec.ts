jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import { Pool } from 'pg';
import { LiveQueryService } from './live-query.service';
import { ReplicationCollector } from '../collector/collectors/replication.collector';

const PRIMARY_URL = process.env.TEST_PRIMARY_DATABASE_URL;
const STANDBY_URL = process.env.TEST_STANDBY_DATABASE_URL;

function poolManagerFor(pool: Pool) {
  return {
    getPool: () => pool,
    query: async (_id: string, sql: string, params: unknown[] = []) =>
      (await pool.query(sql, params)).rows,
  };
}

function serviceFor(pool: Pool) {
  return new LiveQueryService(
    poolManagerFor(pool) as never,
    { backup: { findFirst: async () => null } } as never,
  );
}

(PRIMARY_URL && STANDBY_URL ? describe : describe.skip)(
  'LiveQueryService against a streaming replication cluster',
  () => {
    let primary: Pool;
    let standby: Pool;

    beforeAll(() => {
      primary = new Pool({ connectionString: PRIMARY_URL, max: 2 });
      standby = new Pool({ connectionString: STANDBY_URL, max: 2 });
    });

    afterAll(async () => {
      await primary.end();
      await standby.end();
    });

    it('reads sync quorum, slots and archiver state on the primary', async () => {
      const report = await serviceFor(primary).getReplication('primary');

      expect(report.isPrimary).toBe(true);
      expect(report.replicas.length).toBeGreaterThan(0);
      expect(report.walSizeBytes).toBeGreaterThan(0);
      expect(report.synchronous?.satisfied).toBe(true);
      expect(report.archiver.enabled).toBe(true);
      expect(report.archiver.failing).toBe(false);
      expect(report.archiver.readyCount).not.toBeNull();
    });

    it('reads receiver and replay positions on a standby without failing', async () => {
      const report = await serviceFor(standby).getReplication('standby');

      expect(report.isPrimary).toBe(false);
      expect(report.receiverInfo?.status).toBe('streaming');
      expect(report.receiverInfo?.receivedLsn).toMatch(
        /^[0-9A-F]+\/[0-9A-F]+$/,
      );
      expect(report.standby?.replayLsn).toMatch(/^[0-9A-F]+\/[0-9A-F]+$/);
      expect(report.standby?.paused).toBe(false);
    });

    it('scores the standby replication as healthy', async () => {
      const score = await serviceFor(standby).getHealthScore('standby');
      const replay = score.factors.find((f) => f.id === 'standby_replay');

      expect(replay?.status).toBe('ok');
      expect(replay?.code).toBe('streaming');
    });

    it('measures bloat with pgstattuple_approx when the extension is installed', async () => {
      const report = await serviceFor(primary).getTableBloat('primary');

      expect(report.extensionInstalled).toBe(true);
      expect(report.method).toBe('pgstattuple_approx');
      expect(report.tables.length).toBeGreaterThan(0);
      expect(
        report.tables.every((t) => t.method === 'pgstattuple_approx'),
      ).toBe(true);
    });

    it('collects sync quorum and archiving state for alerts on the primary', async () => {
      const collector = new ReplicationCollector(
        poolManagerFor(primary) as never,
      );
      const result = await collector.run('primary');

      expect(result.meta.success).toBe(true);
      expect(result.data?.syncRequired).toBeGreaterThan(0);
      expect(result.data?.syncHealthy).toBeGreaterThanOrEqual(
        result.data?.syncRequired ?? 1,
      );
      expect(result.data?.archiveFailing).toBe(false);
      expect(result.data?.archiveReadyCount).not.toBeNull();
    });

    it('collects replication metrics on a standby', async () => {
      const collector = new ReplicationCollector(
        poolManagerFor(standby) as never,
      );
      const result = await collector.run('standby');

      expect(result.meta.success).toBe(true);
      expect(result.data?.isPrimary).toBe(false);
      expect(result.data?.receiverInfo?.status).toBe('streaming');
    });
  },
);
