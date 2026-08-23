// ══════════════════════════════════════════════════════════════
// src/app.module.ts — barcha modullarni bog'laydigan root module
// ══════════════════════════════════════════════════════════════

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { TargetsModule } from './targets/targets.module';
import { CollectorModule } from './collector/collector.module';
import { MetricsModule } from './metrics/metrics.module';
import { LiveModule } from './live/live.module';
import { AlertsModule } from './alerts/alerts.module';
import { BackupModule } from './backup/backup.module';
import { RealTimeModule } from './real-time/real-time.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: { singleLine: true, colorize: true },
              },
        redact: [
          'req.headers.authorization',
          'req.body.password',
          'req.body.refreshToken',
        ],
        autoLogging: { ignore: (req) => req.url === '/api/v1/health/live' },
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    DatabaseModule,
    AuditModule,
    HealthModule,
    AuthModule,
    RealTimeModule,
    AlertsModule,
    TargetsModule,
    CollectorModule,
    MetricsModule,
    LiveModule,
    BackupModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },

    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
