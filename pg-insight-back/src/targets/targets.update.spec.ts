jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import { Logger } from '@nestjs/common';
import { decrypt, encrypt, getEncryptionKey } from '../common/crypto.util';
import { TargetPoolManager } from './target-pool.manager';
import { TargetsService } from './targets.service';

const TARGET_ID = '5722600a-0000-4000-8000-000000000001';

describe('TargetsService.update connection settings', () => {
  let row: Record<string, unknown>;
  let createPool: jest.SpyInstance;
  let orchestrator: {
    stopCollection: jest.Mock;
    startCollection: jest.Mock;
    getActiveTargets: () => string[];
  };
  let service: TargetsService;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    row = {
      id: TARGET_ID,
      name: 'ledger',
      host: 'db.example.com',
      port: 5432,
      database: 'ledgercore',
      username: 'insight_monitor',
      passwordEncrypted: encrypt('old-pw', getEncryptionKey()),
      sslMode: 'require',
      status: 'active',
      isActive: true,
      hasStatStatements: true,
    };
    const prisma = {
      target: {
        findMany: jest.fn(async () => [row]),
        findUnique: jest.fn(async () => row),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          row = { ...row, ...data };
          return row;
        }),
      },
    };
    const poolManager = new TargetPoolManager(prisma as never, {} as never);
    createPool = jest
      .spyOn(poolManager, 'createPool')
      .mockResolvedValue({} as never);
    orchestrator = {
      stopCollection: jest.fn(),
      startCollection: jest.fn().mockResolvedValue(undefined),
      getActiveTargets: () => [],
    };
    service = new TargetsService(
      prisma as never,
      poolManager,
      orchestrator as never,
      {} as never,
      { get: () => undefined } as never,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('keeps the stored SSL mode when only the password changes', async () => {
    await service.update(TARGET_ID, { password: 'new-pw' });

    expect(createPool).toHaveBeenCalledTimes(1);
    expect(createPool).toHaveBeenCalledWith(
      TARGET_ID,
      expect.objectContaining({
        password: 'new-pw',
        ssl: { rejectUnauthorized: false },
      }),
    );
    expect(decrypt(row.passwordEncrypted as string, getEncryptionKey())).toBe(
      'new-pw',
    );
  });

  it('reconnects with the new SSL mode and the stored password', async () => {
    await service.update(TARGET_ID, { sslMode: 'verify-full' });

    expect(createPool).toHaveBeenCalledWith(
      TARGET_ID,
      expect.objectContaining({
        password: 'old-pw',
        ssl: { rejectUnauthorized: true },
      }),
    );
    expect(orchestrator.stopCollection).toHaveBeenCalledWith(TARGET_ID);
    expect(orchestrator.startCollection).toHaveBeenCalledWith(TARGET_ID);
  });

  it('reconnects a paused target without resuming its collection', async () => {
    row.status = 'paused';

    await service.update(TARGET_ID, { password: 'new-pw' });

    expect(createPool).toHaveBeenCalledTimes(1);
    expect(orchestrator.startCollection).not.toHaveBeenCalled();
  });

  it('does not touch the pool for a rename', async () => {
    await service.update(TARGET_ID, { name: 'ledger-prod' });

    expect(createPool).not.toHaveBeenCalled();
    expect(orchestrator.stopCollection).not.toHaveBeenCalled();
    expect(row.name).toBe('ledger-prod');
  });
});
