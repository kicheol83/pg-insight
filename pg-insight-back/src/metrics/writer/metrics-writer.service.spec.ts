import type { ConnectionSnapshot } from '../../collector/collectors/connection.collector';
import { MetricsWriterService } from './metrics-writer.service';

describe('MetricsWriterService.writeConnectionSnapshot', () => {
  const collectedAt = new Date('2026-10-09T17:30:00.000Z');
  let query: jest.Mock;
  let writer: MetricsWriterService;

  beforeEach(() => {
    jest.useFakeTimers({ now: collectedAt });
    query = jest.fn().mockResolvedValue({ rows: [] });
    writer = new MetricsWriterService({ query } as never);
  });

  afterEach(() => jest.useRealTimers());

  it('stamps the row with the collection time, not the start of the oldest session', async () => {
    const snapshot = {
      totalConnections: 3,
      activeQueries: 1,
      idleConnections: 2,
      idleInTransaction: 0,
      waitingForLock: 0,
      maxConnections: 100,
      connectionUsagePct: 3,
      byState: [],
      byWaitEvent: [],
      byApplication: [],
      sessions: [{ queryStart: new Date('2026-10-09T09:00:00.000Z') }],
      longestQueryMs: 0,
      longestIdleInTxMs: 0,
      hasLockWaiters: false,
      idleInTxAbortedCount: 0,
    } as unknown as ConnectionSnapshot;

    await writer.writeConnectionSnapshot('target-1', snapshot);

    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO connection_metrics');
    expect(values[0]).toEqual(collectedAt);
  });
});
