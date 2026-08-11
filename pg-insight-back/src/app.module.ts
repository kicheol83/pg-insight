import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { TargetsModule } from './targets/targets.module';
import { CollectorModule } from './collector/collector.module';
import { MetricsModule } from './metrics/metrics.module';
import { LiveModule } from './live/live.module';
import { AlertsModule } from './alerts/alerts.module';
import { RealTimeModule } from './real-time/real-time.module';

@Module({
  imports: [AuthModule, TargetsModule, CollectorModule, MetricsModule, LiveModule, AlertsModule, RealTimeModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
