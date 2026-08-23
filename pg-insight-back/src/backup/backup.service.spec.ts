// ══════════════════════════════════════════════════════════════
// backup.service.spec.ts
//
// child_process.spawn'ni to'liq mock qilamiz — EventEmitter kabi
// ishlaydigan soxta process yaratamiz va 'close'/'error' hodisalarini
// qo'lda chaqirib, BackupService'ning bu hodisalarga to'g'ri
// reaksiya qilishini (DB yozuvini yangilash) tekshiramiz.
// ══════════════════════════════════════════════════════════════

import { EventEmitter } from 'node:events';
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BackupService } from './backup.service';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));
jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  stat: jest.fn().mockResolvedValue({ size: 123456 }),
  unlink: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('node:fs', () => ({
  createReadStream: jest.fn().mockReturnValue({ pipe: jest.fn() }),
}));

import { spawn } from 'node:child_process';
import { unlink } from 'node:fs/promises';

// Bir tikni kutish — fire-and-forget async callback (child.on('close', async ...))
// tugashini kutish uchun
const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

function createMockChild() {
  const child = new EventEmitter() as EventEmitter & {
    stderr: EventEmitter;
    kill: jest.Mock;
  };
  child.stderr = new EventEmitter();
  child.kill = jest.fn();
  return child;
}

describe('BackupService', () => {
  let service: BackupService;
  let backupModel: {
    create: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    delete: jest.Mock;
  };
  let targetModel: { findUnique: jest.Mock };
  let auditRecord: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    backupModel = {
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    };
    targetModel = { findUnique: jest.fn() };
    auditRecord = jest.fn().mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      providers: [
        BackupService,
        {
          provide: PrismaService,
          useValue: { backup: backupModel, target: targetModel },
        },
        { provide: AuditService, useValue: { record: auditRecord } },
      ],
    }).compile();

    service = module.get(BackupService);
  });

  describe('startBackup', () => {
    it('rejects when a backup is already running for the target', async () => {
      backupModel.findMany.mockResolvedValue([
        { id: 'existing', status: 'running' },
      ]);

      await expect(
        service.startBackup('target-1', 'user-1', 'a@b.com'),
      ).rejects.toThrow(BadRequestException);
      expect(spawn).not.toHaveBeenCalled();
    });

    it('rejects when the target does not exist', async () => {
      backupModel.findMany.mockResolvedValue([]);
      targetModel.findUnique.mockResolvedValue(null);

      await expect(
        service.startBackup('missing', 'user-1', 'a@b.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a running backup record and spawns pg_dump with correct args', async () => {
      backupModel.findMany.mockResolvedValue([]);
      targetModel.findUnique.mockResolvedValue({
        id: 'target-1',
        host: 'db.prod',
        port: 5432,
        database: 'app',
        username: 'monitor',
        passwordEncrypted: encryptForTest('supersecret'),
        sslMode: 'require',
      });
      backupModel.create.mockResolvedValue({
        id: 'backup-1',
        targetId: 'target-1',
        status: 'running',
      });
      const mockChild = createMockChild();
      (spawn as jest.Mock).mockReturnValue(mockChild);

      const result = await service.startBackup('target-1', 'user-1', 'a@b.com');

      expect(result.status).toBe('running');
      expect(backupModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            targetId: 'target-1',
            status: 'running',
            triggeredByUserId: 'user-1',
          }),
        }),
      );
      expect(spawn).toHaveBeenCalledWith(
        'pg_dump',
        expect.arrayContaining([
          '--host',
          'db.prod',
          '--port',
          '5432',
          '--username',
          'monitor',
          '--dbname',
          'app',
          '--format',
          'custom',
          '--no-password',
        ]),
        expect.objectContaining({
          env: expect.objectContaining({
            PGPASSWORD: 'supersecret',
            PGSSLMODE: 'require',
          }),
        }),
      );
      expect(auditRecord).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'backup.start' }),
      );
    });

    it('marks the backup completed with file size when pg_dump exits 0', async () => {
      backupModel.findMany.mockResolvedValue([]);
      targetModel.findUnique.mockResolvedValue({
        id: 'target-1',
        host: 'h',
        port: 5432,
        database: 'd',
        username: 'u',
        passwordEncrypted: encryptForTest('p'),
        sslMode: 'prefer',
      });
      backupModel.create.mockResolvedValue({
        id: 'backup-1',
        targetId: 'target-1',
        status: 'running',
      });
      const mockChild = createMockChild();
      (spawn as jest.Mock).mockReturnValue(mockChild);

      await service.startBackup('target-1', 'user-1', 'a@b.com');
      mockChild.emit('close', 0);
      await flushPromises();

      expect(backupModel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'backup-1' },
          data: expect.objectContaining({
            status: 'completed',
            fileSizeBytes: BigInt(123456),
          }),
        }),
      );
    });

    it('marks the backup failed with stderr output when pg_dump exits non-zero', async () => {
      backupModel.findMany.mockResolvedValue([]);
      targetModel.findUnique.mockResolvedValue({
        id: 'target-1',
        host: 'h',
        port: 5432,
        database: 'd',
        username: 'u',
        passwordEncrypted: encryptForTest('p'),
        sslMode: 'prefer',
      });
      backupModel.create.mockResolvedValue({
        id: 'backup-1',
        targetId: 'target-1',
        status: 'running',
      });
      const mockChild = createMockChild();
      (spawn as jest.Mock).mockReturnValue(mockChild);

      await service.startBackup('target-1', 'user-1', 'a@b.com');
      mockChild.stderr.emit(
        'data',
        Buffer.from('pg_dump: error: connection failed'),
      );
      mockChild.emit('close', 1);
      await flushPromises();

      expect(backupModel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'backup-1' },
          data: expect.objectContaining({
            status: 'failed',
            errorMessage: expect.stringContaining('connection failed'),
          }),
        }),
      );
    });

    it('marks the backup failed with a helpful message when the pg_dump binary is missing', async () => {
      backupModel.findMany.mockResolvedValue([]);
      targetModel.findUnique.mockResolvedValue({
        id: 'target-1',
        host: 'h',
        port: 5432,
        database: 'd',
        username: 'u',
        passwordEncrypted: encryptForTest('p'),
        sslMode: 'prefer',
      });
      backupModel.create.mockResolvedValue({
        id: 'backup-1',
        targetId: 'target-1',
        status: 'running',
      });
      const mockChild = createMockChild();
      (spawn as jest.Mock).mockReturnValue(mockChild);

      await service.startBackup('target-1', 'user-1', 'a@b.com');
      mockChild.emit('error', new Error('spawn pg_dump ENOENT'));
      await flushPromises();

      expect(backupModel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            errorMessage: expect.stringContaining('postgresql-client'),
          }),
        }),
      );
    });
  });

  describe('remove', () => {
    it('kills a running process before deleting its record', async () => {
      backupModel.findMany.mockResolvedValue([]);
      targetModel.findUnique.mockResolvedValue({
        id: 'target-1',
        host: 'h',
        port: 5432,
        database: 'd',
        username: 'u',
        passwordEncrypted: encryptForTest('p'),
        sslMode: 'prefer',
      });
      backupModel.create.mockResolvedValue({
        id: 'backup-1',
        targetId: 'target-1',
        status: 'running',
      });
      const mockChild = createMockChild();
      (spawn as jest.Mock).mockReturnValue(mockChild);
      await service.startBackup('target-1', 'user-1', 'a@b.com');

      backupModel.findUnique.mockResolvedValue({
        id: 'backup-1',
        targetId: 'target-1',
        status: 'running',
        filePath: null,
      });
      backupModel.delete.mockResolvedValue({});

      await service.remove('backup-1', 'user-1', 'a@b.com');

      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
      expect(backupModel.delete).toHaveBeenCalledWith({
        where: { id: 'backup-1' },
      });
    });

    it('deletes the backup file from disk when present', async () => {
      backupModel.findUnique.mockResolvedValue({
        id: 'backup-2',
        targetId: 'target-1',
        status: 'completed',
        filePath: '/app/backups/target-1/backup-2.dump',
      });
      backupModel.delete.mockResolvedValue({});

      await service.remove('backup-2', 'user-1', 'a@b.com');

      expect(unlink).toHaveBeenCalledWith(
        '/app/backups/target-1/backup-2.dump',
      );
    });

    it('throws when the backup does not exist', async () => {
      backupModel.findUnique.mockResolvedValue(null);
      await expect(
        service.remove('missing', 'user-1', 'a@b.com'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDownloadStream', () => {
    it('throws when the backup is not yet completed', async () => {
      backupModel.findUnique.mockResolvedValue({
        id: 'b1',
        status: 'running',
        filePath: null,
      });
      await expect(service.getDownloadStream('b1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws when the backup does not exist', async () => {
      backupModel.findUnique.mockResolvedValue(null);
      await expect(service.getDownloadStream('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('list', () => {
    it('orders backups by startedAt descending', async () => {
      backupModel.findMany.mockResolvedValue([{ id: 'b2' }, { id: 'b1' }]);
      const result = await service.list('target-1');
      expect(backupModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { targetId: 'target-1' },
          orderBy: { startedAt: 'desc' },
        }),
      );
      expect(result).toHaveLength(2);
    });
  });
});

// Test uchun oddiy "shifrlash" — haqiqiy crypto.util funksiyasini
// chaqiramiz, shunda BackupService haqiqiy decrypt() bilan mos ishlaydi
function encryptForTest(plaintext: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { encrypt, getEncryptionKey } = require('../common/crypto.util');
  return encrypt(plaintext, getEncryptionKey());
}
