jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { MetricsWriterService } from '../metrics/writer/metrics-writer.service';
import { RealtimeGateway } from '../real-time/real-time.gateway';
import { TargetPoolManager } from '../targets/target-pool.manager';
import { CollectorOrchestrator } from './collector.orchestrator';
import { ConnectionCollector } from './collectors/connection.collector';
import { IoBufferCollector } from './collectors/io-buffer.collector';
import { LockCollector } from './collectors/lock.collector';
import { QueryCollector } from './collectors/query.collector';
import { ReplicationCollector } from './collectors/replication.collector';
import { SystemCollector } from './collectors/system.collector';
import { TableCollector } from './collectors/table.collector';
import { VacuumCollector } from './collectors/vacuum.collector';

@Injectable()
class SlowConnectingPoolManager implements OnModuleInit {
  private readonly entries: Array<{ targetId: string; status: string }> = [];

  async onModuleInit(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    this.entries.push({ targetId: 'ledgercore', status: 'active' });
  }

  getAllEntries() {
    return this.entries;
  }
}

describe('CollectorOrchestrator startup', () => {
  afterEach(() => jest.restoreAllMocks());

  it('starts collecting targets whose pools connect during module init', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const startCollection = jest
      .spyOn(CollectorOrchestrator.prototype, 'startCollection')
      .mockResolvedValue(undefined);

    const stub = {};
    const moduleRef = await Test.createTestingModule({
      providers: [
        CollectorOrchestrator,
        { provide: TargetPoolManager, useClass: SlowConnectingPoolManager },
        { provide: ConnectionCollector, useValue: stub },
        { provide: QueryCollector, useValue: stub },
        { provide: LockCollector, useValue: stub },
        { provide: TableCollector, useValue: stub },
        { provide: VacuumCollector, useValue: stub },
        { provide: ReplicationCollector, useValue: stub },
        { provide: IoBufferCollector, useValue: stub },
        { provide: SystemCollector, useValue: stub },
        { provide: MetricsWriterService, useValue: stub },
        { provide: RealtimeGateway, useValue: stub },
        {
          provide: ConfigService,
          useValue: { get: (_key: string, fallback: unknown) => fallback },
        },
      ],
    }).compile();

    const app = moduleRef.createNestApplication({ logger: false });
    await app.init();

    expect(startCollection).toHaveBeenCalledWith('ledgercore');
    await app.close();
  });
});
