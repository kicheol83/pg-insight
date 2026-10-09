jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import { RequestMethod, Type } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { AdminGuard } from './admin.guard';
import { AuthController } from './auth.controller';
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

const MUTATING = new Set([
  RequestMethod.POST,
  RequestMethod.PUT,
  RequestMethod.PATCH,
  RequestMethod.DELETE,
]);

const OPEN_TO_ANY_SIGNED_IN_USER = new Set([
  'AuthController.login',
  'AuthController.refresh',
  'AuthController.logout',
  'AuthController.registerFirst',
  'TargetsController.refresh',
  'LiveController.explain',
]);

const ADMIN_ONLY_READS = new Set(['BackupController.download']);

function routes() {
  return CONTROLLERS.flatMap((controller) =>
    Object.getOwnPropertyNames(controller.prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => {
        const handler = controller.prototype[name] as object;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as
          RequestMethod | undefined;
        const guards = (Reflect.getMetadata(GUARDS_METADATA, handler) ??
          []) as unknown[];
        return {
          id: `${controller.name}.${name}`,
          method,
          adminOnly: guards.includes(AdminGuard),
        };
      })
      .filter((route) => route.method !== undefined),
  );
}

describe('admin-only route policy', () => {
  it('requires the admin role for every mutating route that is not explicitly opened', () => {
    const unguarded = routes()
      .filter((r) => MUTATING.has(r.method!) && !r.adminOnly)
      .map((r) => r.id)
      .filter((id) => !OPEN_TO_ANY_SIGNED_IN_USER.has(id));

    expect(unguarded).toEqual([]);
  });

  it('requires the admin role for reads that export data', () => {
    const found = routes().filter((r) => ADMIN_ONLY_READS.has(r.id));

    expect(found.map((r) => r.id).sort()).toEqual([...ADMIN_ONLY_READS].sort());
    expect(found.every((r) => r.adminOnly)).toBe(true);
  });

  it('keeps the explicit exceptions pointing at real routes', () => {
    const ids = new Set(routes().map((r) => r.id));

    expect(
      [...OPEN_TO_ANY_SIGNED_IN_USER].filter((id) => !ids.has(id)),
    ).toEqual([]);
  });
});
