import { Module } from '@nestjs/common';
import { AlertsController } from './alerts.controller';
import { AlertEngineService } from './alert-engine.service';
import { RealTimeModule } from '../real-time/real-time.module';
import { TargetHostPolicy } from '../targets/target-host.policy';

@Module({
  imports: [RealTimeModule],
  controllers: [AlertsController],
  providers: [AlertEngineService, TargetHostPolicy],
  exports: [AlertEngineService],
})
export class AlertsModule {}
