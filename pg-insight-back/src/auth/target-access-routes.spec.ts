jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import { Type } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TargetAccessGuard } from './target-access.guard';
import { AppModule } from '../app.module';
import { TARGET_ACCESS_KEY, TargetAccessRule } from './target-access.decorator';
import { AlertsController } from '../alerts/alerts.controller';
import { AppController } from '../app.controller';
import { BackupController } from '../backup/backup.controller';
import { HealthController } from '../health/health.controller';
import { LiveController } from '../live/live.controller';
import { MaintenanceController } from '../maintenance/maintenance.controller';
import { MetricsController } from '../metrics/metrics.controller';
import { SecurityAuditController } from '../security/security-audit.controller';
import { TargetsController } from '../targets/targets.controller';

const CONTROLLERS: Type[] = [
  AuthController,
  AlertsController,
  AppController,
  BackupController,
  HealthController,
  LiveController,
  MaintenanceController,
  MetricsController,
  SecurityAuditController,
  TargetsController,
];

const PARAMS_CHECKED_ELSEWHERE = new Set(['LiveController.cancelQuery:pid']);

function pathParams(path: string | string[] | undefined): string[] {
  const joined = ([] as string[]).concat(path ?? []).join('/');
  return [...joined.matchAll(/:(\w+)/g)].map((m) => m[1]);
}

function uncoveredParams(): string[] {
  return CONTROLLERS.flatMap((controller) => {
    const base = Reflect.getMetadata(PATH_METADATA, controller) as string;
    return Object.getOwnPropertyNames(controller.prototype)
      .filter((name) => name !== 'constructor')
      .flatMap((name) => {
        const handler = controller.prototype[name] as object;
        if (Reflect.getMetadata(METHOD_METADATA, handler) === undefined) {
          return [];
        }
        const declared = new Set(
          (
            (Reflect.getMetadata(TARGET_ACCESS_KEY, handler) ??
              []) as TargetAccessRule[]
          ).map((rule) => rule.param),
        );
        const params = pathParams([
          base,
          Reflect.getMetadata(PATH_METADATA, handler) as string,
        ]);
        return params
          .filter((param) => param !== 'targetId' && !declared.has(param))
          .map((param) => `${controller.name}.${name}:${param}`)
          .filter((id) => !PARAMS_CHECKED_ELSEWHERE.has(id));
      });
  });
}

describe('tenant isolation route policy', () => {
  it('maps every path parameter to a target ownership check', () => {
    expect(uncoveredParams()).toEqual([]);
  });

  it('runs the ownership guard globally, after authentication', () => {
    const guards = (
      Reflect.getMetadata('providers', AppModule) as Array<{
        provide?: unknown;
        useClass?: unknown;
      }>
    )
      .filter((provider) => provider.provide === APP_GUARD)
      .map((provider) => provider.useClass);

    expect(guards.indexOf(TargetAccessGuard)).toBeGreaterThan(
      guards.indexOf(JwtAuthGuard),
    );
    expect(guards.indexOf(JwtAuthGuard)).toBeGreaterThanOrEqual(0);
  });
});
