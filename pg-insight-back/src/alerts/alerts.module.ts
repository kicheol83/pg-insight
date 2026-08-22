import { Module } from '@nestjs/common';
import { AlertsController } from './alerts.controller';
import { AlertEngineService } from './alert-engine.service';
import { RealTimeModule } from '../real-time/real-time.module';

@Module({
  imports: [RealTimeModule],
  controllers: [AlertsController],
  providers: [AlertEngineService],
  exports: [AlertEngineService],
})
export class AlertsModule {}
