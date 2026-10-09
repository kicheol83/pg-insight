jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import { Logger } from '@nestjs/common';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  let create: jest.Mock;
  let service: AuditService;

  beforeEach(() => {
    create = jest.fn().mockResolvedValue({});
    service = new AuditService({ auditLog: { create } } as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it('stores the entry as given', async () => {
    const entry = {
      action: 'login' as const,
      userId: 'user-1',
      userEmail: 'a@example.com',
      ipAddress: '203.0.114.7',
    };

    await service.record(entry);

    expect(create).toHaveBeenCalledWith({ data: entry });
  });

  it('never lets a failed audit write break the calling request', async () => {
    create.mockRejectedValue(new Error('connection lost'));
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await expect(
      service.record({ action: 'login_failed', userEmail: 'a@example.com' }),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('connection lost'),
    );
  });
});
