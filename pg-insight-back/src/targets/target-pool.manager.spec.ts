jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import { Logger } from '@nestjs/common';
import { encrypt, getEncryptionKey } from '../common/crypto.util';
import { TargetHostPolicy } from './target-host.policy';
import { TargetPoolManager } from './target-pool.manager';

const TARGET_ID = '5722600a-0000-4000-8000-000000000000';

describe('TargetPoolManager.reconnect', () => {
  let findUnique: jest.Mock;
  let manager: TargetPoolManager;
  let createPool: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    findUnique = jest.fn();
    manager = new TargetPoolManager(
      { target: { findUnique } } as never,
      {} as never,
    );
    createPool = jest
      .spyOn(manager, 'createPool')
      .mockResolvedValue({} as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it('reconnects with the decrypted stored password and ssl mode', async () => {
    findUnique.mockResolvedValue({
      id: TARGET_ID,
      host: 'ledgercore-db',
      port: 5432,
      database: 'ledgercore',
      username: 'insight_monitor',
      passwordEncrypted: encrypt('s3cret-pw', getEncryptionKey()),
      sslMode: 'require',
      isActive: true,
    });

    await manager.reconnect(TARGET_ID);

    expect(createPool).toHaveBeenCalledWith(TARGET_ID, {
      host: 'ledgercore-db',
      port: 5432,
      database: 'ledgercore',
      user: 'insight_monitor',
      password: 's3cret-pw',
      ssl: { rejectUnauthorized: false },
    });
  });

  it('fails when the target no longer exists', async () => {
    findUnique.mockResolvedValue(null);

    await expect(manager.reconnect(TARGET_ID)).rejects.toThrow('not found');
    expect(createPool).not.toHaveBeenCalled();
  });
});

describe('TargetPoolManager.createPool host policy', () => {
  const DATABASE_URL = process.env.TEST_TARGET_DATABASE_URL;

  function managerOwnedBy(role: string) {
    const prisma = {
      target: {
        findUnique: jest.fn().mockResolvedValue({ createdByUser: { role } }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const policy = new TargetHostPolicy({ get: () => undefined } as never);
    return new TargetPoolManager(prisma as never, policy);
  }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it("refuses to open a pool to an internal host for a regular user's target", async () => {
    const manager = managerOwnedBy('user');

    await expect(
      manager.createPool(TARGET_ID, {
        host: 'ledgercore-db',
        port: 5432,
        database: 'ledgercore',
        user: 'insight_monitor',
        password: 'x',
      }),
    ).rejects.toThrow('private or internal address');
    expect(manager.getPool(TARGET_ID)).toBeNull();
  });

  (DATABASE_URL ? it : it.skip)(
    'connects to the same internal host when the target belongs to the platform admin',
    async () => {
      const url = new URL(DATABASE_URL!);
      const manager = managerOwnedBy('admin');

      const entry = await manager.createPool(TARGET_ID, {
        host: url.hostname,
        port: Number(url.port || 5432),
        database: url.pathname.slice(1),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
      });

      expect(entry.status).toBe('active');
      await manager.removePool(TARGET_ID);
    },
  );
});

describe('TargetPoolManager status after reconnect', () => {
  const DATABASE_URL = process.env.TEST_TARGET_DATABASE_URL;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  (DATABASE_URL ? it : it.skip)(
    'keeps a paused target paused when its pool reconnects',
    async () => {
      const url = new URL(DATABASE_URL!);
      let row: Record<string, unknown> = {
        id: TARGET_ID,
        host: url.hostname,
        port: Number(url.port || 5432),
        database: url.pathname.slice(1),
        username: decodeURIComponent(url.username),
        passwordEncrypted: encrypt(
          decodeURIComponent(url.password),
          getEncryptionKey(),
        ),
        sslMode: 'disable',
        isActive: true,
        status: 'paused',
        createdByUser: { role: 'admin' },
      };
      const prisma = {
        target: {
          findUnique: jest.fn(async () => row),
          findMany: jest.fn(async () => (row.status === 'paused' ? [row] : [])),
          update: jest.fn(
            async ({ data }: { data: Record<string, unknown> }) => {
              row = { ...row, ...data };
              return row;
            },
          ),
          updateMany: jest.fn(
            async ({
              where,
              data,
            }: {
              where: { status: { not: string } };
              data: Record<string, unknown>;
            }) => {
              if (row.status === where.status.not) return { count: 0 };
              row = { ...row, ...data };
              return { count: 1 };
            },
          ),
        },
      };
      const manager = new TargetPoolManager(
        prisma as never,
        new TargetHostPolicy({ get: () => undefined } as never),
      );

      try {
        const entry = await manager.reconnect(TARGET_ID);

        expect(entry.status).toBe('active');
        expect(row.status).toBe('paused');
        expect(row.pgVersion).toBeDefined();
        expect(await manager.pausedTargetIds()).toEqual([TARGET_ID]);
      } finally {
        await manager.removePool(TARGET_ID);
      }
    },
  );
});
