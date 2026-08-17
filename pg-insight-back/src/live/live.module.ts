import { Module } from '@nestjs/common'
import { LiveController } from './live.controller'
import { LiveQueryService } from './live-query.service'
import { TargetsModule } from '../targets/targets.module'
import { AuditModule } from '../audit/audit.module'

@Module({
  imports: [TargetsModule, AuditModule],
  controllers: [LiveController],
  providers: [LiveQueryService],
})
export class LiveModule {}