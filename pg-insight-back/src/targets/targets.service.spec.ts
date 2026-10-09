jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TargetHostPolicy } from './target-host.policy';
import { TargetsService } from './targets.service';

const dto = {
  name: 'ledger',
  host: 'ledgercore-db',
  port: 5432,
  database: 'ledgercore',
  username: 'insight_monitor',
  password: 'x',
};

describe('TargetsService target creation limits', () => {
  let count: jest.Mock;
  let service: TargetsService;

  beforeEach(() => {
    count = jest.fn().mockResolvedValue(0);
    const env: Record<string, string> = { TARGET_QUOTA_PER_USER: '3' };
    const config = { get: (key: string) => env[key] };
    service = new TargetsService(
      { target: { count } } as never,
      {} as never,
      {} as never,
      new TargetHostPolicy(config as never),
      config as never,
    );
  });

  it('refuses a fourth active target for a regular user', async () => {
    count.mockResolvedValue(3);

    await expect(
      service.create(dto, { id: 'alice', role: 'user' }),
    ).rejects.toThrow(ForbiddenException);
    expect(count).toHaveBeenCalledWith({
      where: { createdByUserId: 'alice', isActive: true },
    });
  });

  it('refuses an internal host for a regular user before connecting', async () => {
    await expect(
      service.create(dto, { id: 'alice', role: 'user' }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects localhost in a regular user's connection test", async () => {
    await expect(
      service.testConnection({ ...dto, host: 'localhost' }, false),
    ).rejects.toThrow('private or internal address');
  });

  it('applies neither the quota nor the host policy to the platform admin', async () => {
    count.mockResolvedValue(99);

    await expect(
      service.create(
        { ...dto, host: 'unresolvable-admin-host.invalid' },
        { id: 'root', role: 'admin' },
      ),
    ).rejects.toThrow('Cannot connect to PostgreSQL');
    expect(count).not.toHaveBeenCalled();
  });
});

describe('TargetsService default SSL mode', () => {
  it('stores and connects a new target with sslmode require when none is given', async () => {
    const create = jest.fn().mockResolvedValue({ id: 't1', name: 'ledger' });
    const createPool = jest.fn().mockResolvedValue({});
    const config = { get: () => undefined };
    const service = new TargetsService(
      {
        target: {
          count: jest.fn(),
          findFirst: jest.fn().mockResolvedValue(null),
          create,
        },
      } as never,
      { createPool } as never,
      { startCollection: jest.fn() } as never,
      new TargetHostPolicy(config as never),
      config as never,
    );
    const testConnection = jest
      .spyOn(service, 'testConnection')
      .mockResolvedValue({ success: true } as never);
    jest.spyOn(service, 'findOne').mockResolvedValue({} as never);

    await service.create(
      { ...dto, host: 'db.example.com' },
      { id: 'root', role: 'admin' },
    );

    expect(testConnection).toHaveBeenCalledWith(
      expect.objectContaining({ sslMode: 'require' }),
      true,
    );
    expect(create.mock.calls[0][0].data.sslMode).toBe('require');
    expect(createPool).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ ssl: { rejectUnauthorized: false } }),
    );
  });
});
