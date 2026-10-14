import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { TargetPoolManager } from '../targets/target-pool.manager';
import { AuditService } from '../audit/audit.service';

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe('MaintenanceService', () => {
  let service: MaintenanceService;
  let poolManager: { query: jest.Mock };
  let auditRecord: jest.Mock;

  beforeEach(async () => {
    poolManager = { query: jest.fn() };
    auditRecord = jest.fn().mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      providers: [
        MaintenanceService,
        { provide: TargetPoolManager, useValue: poolManager },
        { provide: AuditService, useValue: { record: auditRecord } },
      ],
    }).compile();

    service = module.get(MaintenanceService);
  });

  describe('vacuumTable', () => {
    it('rejects when the table does not exist', async () => {
      poolManager.query.mockResolvedValueOnce([{ exists: false }]);

      await expect(
        service.vacuumTable('t1', 'public', 'ghost', 'u1', 'a@b.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('runs VACUUM (ANALYZE) with a properly quoted identifier once existence is confirmed', async () => {
      poolManager.query
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([]);

      const result = await service.vacuumTable(
        't1',
        'public',
        'events',
        'u1',
        'a@b.com',
      );

      expect(result).toEqual({ started: true, target: 'public.events' });
      expect(poolManager.query).toHaveBeenNthCalledWith(
        2,
        't1',
        'VACUUM (ANALYZE) "public"."events"',
      );
      expect(auditRecord).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'maintenance.vacuum.start' }),
      );
    });

    it('records a completion audit entry once the background VACUUM finishes', async () => {
      poolManager.query
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([]);

      await service.vacuumTable('t1', 'public', 'events', 'u1', 'a@b.com');
      await flushPromises();

      expect(auditRecord).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'maintenance.vacuum.complete' }),
      );
    });

    it('records a failure audit entry when the background VACUUM errors', async () => {
      poolManager.query
        .mockResolvedValueOnce([{ exists: true }])
        .mockRejectedValueOnce(
          new Error('canceling statement due to lock timeout'),
        );

      await service.vacuumTable('t1', 'public', 'events', 'u1', 'a@b.com');
      await flushPromises();

      expect(auditRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'maintenance.vacuum.failed',
          detail: expect.stringContaining('lock timeout'),
        }),
      );
    });

    it('never sends the raw table name from the request directly into an unquoted SQL string', async () => {
      poolManager.query
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([]);

      await service.vacuumTable('t1', 'public', 'my_table', 'u1', 'a@b.com');

      const secondCallSql = poolManager.query.mock.calls[1][1] as string;
      expect(secondCallSql).toContain('"public"."my_table"');
    });
  });

  describe('dropUnusedIndex', () => {
    it('rejects when the index does not exist', async () => {
      poolManager.query.mockResolvedValueOnce([{ exists: false }]);
      await expect(
        service.dropUnusedIndex('t1', 'public', 'ghost_idx', 'u1', 'a@b.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('re-verifies usage server-side and refuses to drop an index that has since been used', async () => {
      poolManager.query
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([{ idx_scan: '42' }]);

      await expect(
        service.dropUnusedIndex('t1', 'public', 'idx_events', 'u1', 'a@b.com'),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses to drop an index that backs a constraint (primary key / unique)', async () => {
      poolManager.query
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([{ idx_scan: '0' }])
        .mockResolvedValueOnce([{ exists: true }]);

      await expect(
        service.dropUnusedIndex('t1', 'public', 'events_pkey', 'u1', 'a@b.com'),
      ).rejects.toThrow(BadRequestException);
    });

    it('drops a genuinely unused, non-constraint index', async () => {
      poolManager.query
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([{ idx_scan: '0' }])
        .mockResolvedValueOnce([{ exists: false }])
        .mockResolvedValueOnce([]);

      const result = await service.dropUnusedIndex(
        't1',
        'public',
        'idx_legacy',
        'u1',
        'a@b.com',
      );

      expect(result).toEqual({ started: true, index: 'public.idx_legacy' });
      expect(poolManager.query).toHaveBeenNthCalledWith(
        4,
        't1',
        'DROP INDEX CONCURRENTLY "public"."idx_legacy"',
      );
    });
  });
});
