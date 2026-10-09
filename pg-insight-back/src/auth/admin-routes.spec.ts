jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import { RequestMethod, Type } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { AdminGuard } from './admin.guard';
import { AuthController } from './auth.controller';
import { TARGET_ACCESS_KEY } from './target-access.decorator';
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

const OPEN_WITHOUT_TARGET = new Set([
  'AuthController.login',
  'AuthController.refresh',
  'AuthController.logout',
  'AuthController.registerFirst',
  'TargetsController.create',
  'TargetsController.testConnection',
]);

const ADMIN_ONLY = new Set([
  'AuthController.register',
  'BackupController.start',
  'BackupController.download',
  'BackupController.remove',
]);

function routes() {
  return CONTROLLERS.flatMap((controller) => {
    const base = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
    return Object.getOwnPropertyNames(controller.prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => {
        const handler = controller.prototype[name] as object;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as
          RequestMethod | undefined;
        const path = `${base}/${String(Reflect.getMetadata(PATH_METADATA, handler) ?? '')}`;
        const guards = (Reflect.getMetadata(GUARDS_METADATA, handler) ??
          []) as unknown[];
        return {
          id: `${controller.name}.${name}`,
          method,
          adminOnly: guards.includes(AdminGuard),
          ownerChecked:
            path.includes(':targetId') ||
            Reflect.getMetadata(TARGET_ACCESS_KEY, handler) !== undefined,
        };
      })
      .filter((route) => route.method !== undefined);
  });
}

describe('mutating route policy', () => {
  it('protects every mutating route by target ownership or the admin role', () => {
    const unprotected = routes()
      .filter((r) => MUTATING.has(r.method!) && !r.adminOnly && !r.ownerChecked)
      .map((r) => r.id)
      .filter((id) => !OPEN_WITHOUT_TARGET.has(id));

    expect(unprotected).toEqual([]);
  });

  it('keeps platform-level operations admin-only', () => {
    const found = routes().filter((r) => ADMIN_ONLY.has(r.id));

    expect(found.map((r) => r.id).sort()).toEqual([...ADMIN_ONLY].sort());
    expect(found.filter((r) => !r.adminOnly).map((r) => r.id)).toEqual([]);
  });

  it('keeps the explicit exceptions pointing at real routes', () => {
    const ids = new Set(routes().map((r) => r.id));

    expect([...OPEN_WITHOUT_TARGET].filter((id) => !ids.has(id))).toEqual([]);
  });
});
