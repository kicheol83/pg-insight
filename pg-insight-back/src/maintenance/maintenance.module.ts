import { Module } from '@nestjs/common';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';
import { TargetsModule } from '../targets/targets.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TargetsModule, AuditModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
