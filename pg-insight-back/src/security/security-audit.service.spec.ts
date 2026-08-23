import { Test } from '@nestjs/testing';
import { SecurityAuditService } from './security-audit.service';
import { TargetPoolManager } from '../targets/target-pool.manager';

describe('SecurityAuditService', () => {
  let service: SecurityAuditService;
  let poolManager: { query: jest.Mock };

  beforeEach(async () => {
    poolManager = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        SecurityAuditService,
        { provide: TargetPoolManager, useValue: poolManager },
      ],
    }).compile();
    service = module.get(SecurityAuditService);
  });

  describe('runAudit — happy path', () => {
    it('returns all 6 checks with ok status when the database is well-configured', async () => {
      poolManager.query.mockImplementation(async (_id: string, sql: string) => {
        if (sql.includes('rolsuper = true')) return [{ rolname: 'postgres' }];
        if (sql.includes('rolcreatedb')) return [];
        if (sql.includes('has_schema_privilege'))
          return [{ can_create: false }];
        if (sql.includes("name = 'ssl'")) return [{ setting: 'on' }];
        if (sql.includes('pg_stat_ssl')) return [{ ssl: true, cnt: '5' }];
        if (sql.includes('password_encryption'))
          return [{ setting: 'scram-sha-256' }];
        if (sql.includes('pg_hba_file_rules')) return [];
        return [];
      });

      const report = await service.runAudit('target-1');

      expect(report.checks).toHaveLength(6);
      const byId = Object.fromEntries(report.checks.map((c) => [c.id, c]));
      expect(byId.superusers.status).toBe('info');
      expect(byId.dangerous_privileges.status).toBe('ok');
      expect(byId.public_schema_create.status).toBe('ok');
      expect(byId.ssl.status).toBe('ok');
      expect(byId.password_encryption.status).toBe('ok');
      expect(byId.hba_weak_auth.status).toBe('ok');
    });
  });

  describe('individual check logic', () => {
    it('flags more than 2 superusers as a warning', async () => {
      poolManager.query.mockImplementation(async (_id, sql: string) => {
        if (sql.includes('rolsuper = true'))
          return [{ rolname: 'a' }, { rolname: 'b' }, { rolname: 'c' }];
        return [];
      });
      const report = await service.runAudit('target-1');
      const check = report.checks.find((c) => c.id === 'superusers')!;
      expect(check.status).toBe('warning');
      expect(check.items).toEqual(['a', 'b', 'c']);
    });

    it('flags non-superuser roles with BYPASSRLS', async () => {
      poolManager.query.mockImplementation(async (_id, sql: string) => {
        if (sql.includes('rolcreatedb')) {
          return [
            {
              rolname: 'app_admin',
              rolcreatedb: false,
              rolcreaterole: false,
              rolbypassrls: true,
              rolreplication: false,
            },
          ];
        }
        return [];
      });
      const report = await service.runAudit('target-1');
      const check = report.checks.find((c) => c.id === 'dangerous_privileges')!;
      expect(check.status).toBe('warning');
      expect(check.items![0]).toContain('BYPASSRLS');
    });

    it('flags PUBLIC having CREATE on the public schema as a warning', async () => {
      poolManager.query.mockImplementation(async (_id, sql: string) => {
        if (sql.includes('has_schema_privilege')) return [{ can_create: true }];
        return [];
      });
      const report = await service.runAudit('target-1');
      const check = report.checks.find((c) => c.id === 'public_schema_create')!;
      expect(check.status).toBe('warning');
      expect(check.recommendation).toContain('REVOKE');
    });

    it('flags SSL disabled at the server level as a warning', async () => {
      poolManager.query.mockImplementation(async (_id, sql: string) => {
        if (sql.includes("name = 'ssl'")) return [{ setting: 'off' }];
        return [];
      });
      const report = await service.runAudit('target-1');
      const check = report.checks.find((c) => c.id === 'ssl')!;
      expect(check.status).toBe('warning');
    });

    it('flags md5 password encryption as a warning (scram-sha-256 preferred)', async () => {
      poolManager.query.mockImplementation(async (_id, sql: string) => {
        if (sql.includes('password_encryption')) return [{ setting: 'md5' }];
        return [];
      });
      const report = await service.runAudit('target-1');
      const check = report.checks.find((c) => c.id === 'password_encryption')!;
      expect(check.status).toBe('warning');
    });

    it('flags trust authentication in pg_hba.conf as a warning with explicit callout', async () => {
      poolManager.query.mockImplementation(async (_id, sql: string) => {
        if (sql.includes('pg_hba_file_rules')) {
          return [
            {
              type: 'host',
              database: ['all'],
              user_name: ['all'],
              address: '0.0.0.0/0',
              auth_method: 'trust',
            },
          ];
        }
        return [];
      });
      const report = await service.runAudit('target-1');
      const check = report.checks.find((c) => c.id === 'hba_weak_auth')!;
      expect(check.status).toBe('warning');
      expect(check.message).toContain('trust');
    });
  });

  describe('graceful degradation', () => {
    it('marks a check as unavailable (not a crash) when the underlying query fails due to permissions', async () => {
      poolManager.query.mockImplementation(async (_id, sql: string) => {
        if (sql.includes('pg_hba_file_rules'))
          throw new Error('permission denied for function pg_hba_file_rules');
        return [];
      });
      const report = await service.runAudit('target-1');
      const check = report.checks.find((c) => c.id === 'hba_weak_auth')!;
      expect(check.status).toBe('unavailable');
      expect(check.message).toContain('permission denied');
    });

    it('still returns all other checks when one check fails entirely', async () => {
      poolManager.query.mockImplementation(async (_id, sql: string) => {
        if (sql.includes('rolsuper = true'))
          throw new Error('connection reset');
        return [];
      });
      const report = await service.runAudit('target-1');
      expect(report.checks).toHaveLength(6);
      expect(report.checks.find((c) => c.id === 'superusers')!.status).toBe(
        'unavailable',
      );
      expect(report.checks.find((c) => c.id === 'ssl')!.status).not.toBe(
        'unavailable',
      );
    });

    it('does not fail the whole audit when pg_stat_ssl is restricted but the ssl setting itself is readable', async () => {
      poolManager.query.mockImplementation(async (_id, sql: string) => {
        if (sql.includes("name = 'ssl'")) return [{ setting: 'on' }];
        if (sql.includes('pg_stat_ssl'))
          throw new Error('permission denied for pg_stat_ssl');
        return [];
      });
      const report = await service.runAudit('target-1');
      const check = report.checks.find((c) => c.id === 'ssl')!;
      expect(check.status).not.toBe('unavailable');
      expect(check.status).toBe('ok');
    });
  });
});
