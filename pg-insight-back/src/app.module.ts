// ══════════════════════════════════════════════════════════════
// src/app.module.ts — barcha modullarni bog'laydigan root module
// ══════════════════════════════════════════════════════════════

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { TargetsModule } from './targets/targets.module';
import { CollectorModule } from './collector/collector.module';
import { MetricsModule } from './metrics/metrics.module';
import { LiveModule } from './live/live.module';
import { AlertsModule } from './alerts/alerts.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RealTimeModule } from './real-time/real-time.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    DatabaseModule,
    AuthModule,
    RealTimeModule,
    AlertsModule,
    TargetsModule,
    CollectorModule,
    MetricsModule,
    LiveModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
