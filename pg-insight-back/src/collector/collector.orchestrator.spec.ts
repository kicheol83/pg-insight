jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import { Logger } from '@nestjs/common';
import { CollectorOrchestrator } from './collector.orchestrator';

const TARGET_ID = '5722600a-0000-4000-8000-000000000000';

describe('CollectorOrchestrator error handling', () => {
  let orchestrator: CollectorOrchestrator;
  let poolManager: {
    reconnect: jest.Mock;
    createPool: jest.Mock;
    getAllEntries: jest.Mock;
  };
  let warn: jest.SpyInstance;
  let internals: {
    errorStates: Map<string, { consecutiveErrors: number; retryAt?: Date }>;
    targetIntervals: Map<string, { targetId: string }>;
    runWithErrorTracking: (
      id: string,
      fn: () => Promise<void>,
    ) => Promise<void>;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    poolManager = {
      reconnect: jest.fn().mockResolvedValue({}),
      createPool: jest.fn(),
      getAllEntries: jest.fn().mockReturnValue([]),
    };
    const config = { get: (_key: string, fallback: unknown) => fallback };
    const unused = {} as never;

    orchestrator = new CollectorOrchestrator(
      poolManager as never,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      config as never,
    );

    internals = orchestrator as unknown as typeof internals;
    internals.errorStates.set(TARGET_ID, { consecutiveErrors: 0 });
    internals.targetIntervals.set(TARGET_ID, { targetId: TARGET_ID });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const failing = () => Promise.reject(new Error('broadcast exploded'));

  async function pauseOnce(): Promise<void> {
    internals.errorStates.get(TARGET_ID)!.retryAt = undefined;
    for (let i = 0; i < 3; i++) {
      await internals.runWithErrorTracking(TARGET_ID, failing);
    }
  }

  it('logs every swallowed error with its message', async () => {
    await internals.runWithErrorTracking(TARGET_ID, failing);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('collection error 1/3: broadcast exploded'),
    );
  });

  it('reconnects through the stored credentials instead of an empty password', async () => {
    await pauseOnce();

    await jest.advanceTimersByTimeAsync(30_000);

    expect(poolManager.reconnect).toHaveBeenCalledWith(TARGET_ID);
    expect(poolManager.createPool).not.toHaveBeenCalled();
  });

  it('schedules a single reconnect when collection pauses repeatedly', async () => {
    await pauseOnce();
    await pauseOnce();
    await pauseOnce();

    await jest.advanceTimersByTimeAsync(30_000);

    expect(poolManager.reconnect).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending reconnect when collection stops', async () => {
    await pauseOnce();

    orchestrator.stopCollection(TARGET_ID);
    await jest.advanceTimersByTimeAsync(30_000);

    expect(poolManager.reconnect).not.toHaveBeenCalled();
  });
});
