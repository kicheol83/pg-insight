import { Module, forwardRef } from '@nestjs/common';
import { TargetsController } from './targets.controller';
import { TargetsService } from './targets.service';
import { TargetPoolManager } from './target-pool.manager';
import { CollectorModule } from '../collector/collector.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [forwardRef(() => CollectorModule), AuditModule],
  controllers: [TargetsController],
  providers: [TargetsService, TargetPoolManager],
  exports: [TargetPoolManager],
})
export class TargetsModule {}
