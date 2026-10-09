jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import { Logger } from '@nestjs/common';
import { encrypt, getEncryptionKey } from '../common/crypto.util';
import { TargetPoolManager } from './target-pool.manager';

const TARGET_ID = '5722600a-0000-4000-8000-000000000000';

describe('TargetPoolManager.reconnect', () => {
  let findUnique: jest.Mock;
  let manager: TargetPoolManager;
  let createPool: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    findUnique = jest.fn();
    manager = new TargetPoolManager({ target: { findUnique } } as never);
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
