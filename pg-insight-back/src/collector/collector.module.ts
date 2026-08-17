import { Module, forwardRef } from '@nestjs/common';
import { CollectorOrchestrator } from './collector.orchestrator';
import { ConnectionCollector } from './collectors/connection.collector';
import { QueryCollector } from './collectors/query.collector';
import { LockCollector } from './collectors/lock.collector';
import { TableCollector } from './collectors/table.collector';
import { VacuumCollector } from './collectors/vacuum.collector';
import { ReplicationCollector } from './collectors/replication.collector';
import { IoBufferCollector } from './collectors/io-buffer.collector';
import { SystemCollector } from './collectors/system.collector';
import { TargetsModule } from '../targets/targets.module';
import { MetricsModule } from '../metrics/metrics.module';
import { AlertsModule } from '../alerts/alerts.module';
import { RealTimeModule } from '../real-time/real-time.module';

@Module({
  imports: [
    forwardRef(() => TargetsModule),
    MetricsModule,
    RealTimeModule,
    AlertsModule,
  ],
  providers: [
    CollectorOrchestrator,
    ConnectionCollector,
    QueryCollector,
    LockCollector,
    TableCollector,
    VacuumCollector,
    ReplicationCollector,
    IoBufferCollector,
    SystemCollector,
  ],
  exports: [CollectorOrchestrator],
})
export class CollectorModule {}
