import { Module } from '@nestjs/common';
import { AlertsController } from './alerts.controller';
import { AlertEngineService } from './alert-engine.service';

@Module({
  controllers: [AlertsController],
  providers: [AlertEngineService],
  exports: [AlertEngineService],
})
export class AlertsModule {}
