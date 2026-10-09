jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import { ServiceUnavailableException } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { PLATFORM_POOL } from '../database/token';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let queryRaw: jest.Mock;
  let timescaleQuery: jest.Mock;

  beforeEach(async () => {
    queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    timescaleQuery = jest.fn().mockResolvedValue({ rows: [] });

    const moduleRef = await Test.createTestingModule({
      imports: [TerminusModule.forRoot({ logger: false })],
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
        { provide: PLATFORM_POOL, useValue: { query: timescaleQuery } },
      ],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('reports both databases up', async () => {
    await expect(controller.check()).resolves.toMatchObject({
      status: 'ok',
      info: {
        platformDb: { status: 'up' },
        timescaleDb: { status: 'up' },
      },
    });
  });

  it('fails readiness when the metrics database is unreachable', async () => {
    timescaleQuery.mockRejectedValue(new Error('ECONNREFUSED'));

    const failure = await controller.check().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect(
      (failure as ServiceUnavailableException).getResponse(),
    ).toMatchObject({
      status: 'error',
      info: { platformDb: { status: 'up' } },
      error: { timescaleDb: { status: 'down', message: 'ECONNREFUSED' } },
    });
  });

  it('answers liveness without touching either database', () => {
    expect(controller.live()).toMatchObject({ status: 'ok' });
    expect(queryRaw).not.toHaveBeenCalled();
    expect(timescaleQuery).not.toHaveBeenCalled();
  });
});
