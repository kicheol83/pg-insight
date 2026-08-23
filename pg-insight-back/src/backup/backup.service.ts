import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../database/prisma.service';
import { decrypt, getEncryptionKey } from '../common/crypto.util';
import { AuditService } from '../audit/audit.service';

export interface BackupRecord {
  id: string;
  targetId: string;
  status: string;
  format: string;
  filePath: string | null;
  fileSizeBytes: bigint | null;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
  triggeredByUserId: string | null;
}

type SerializedBackup = Omit<BackupRecord, 'fileSizeBytes'> & {
  fileSizeBytes: string | null;
};

function serializeBackup(record: BackupRecord): SerializedBackup {
  return {
    ...record,
    fileSizeBytes:
      record.fileSizeBytes != null ? record.fileSizeBytes.toString() : null,
  };
}

const BACKUP_DIR = process.env.BACKUP_DIR ?? '/app/backups';

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly runningProcesses = new Map<string, ChildProcess>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private get backupModel() {
    return (this.prisma as unknown as Record<string, unknown>)['backup'] as {
      create: (args: unknown) => Promise<BackupRecord>;
      update: (args: unknown) => Promise<BackupRecord>;
      findMany: (args: unknown) => Promise<BackupRecord[]>;
      findUnique: (args: unknown) => Promise<BackupRecord | null>;
      delete: (args: unknown) => Promise<BackupRecord>;
    };
  }

  private get targetModel() {
    return (this.prisma as unknown as Record<string, unknown>)['target'] as {
      findUnique: (args: unknown) => Promise<{
        id: string;
        name: string;
        host: string;
        port: number;
        database: string;
        username: string;
        passwordEncrypted: string;
        sslMode: string;
      } | null>;
    };
  }

  async startBackup(
    targetId: string,
    userId: string,
    userEmail: string,
  ): Promise<SerializedBackup> {
    const alreadyRunning = await this.backupModel.findMany({
      where: { targetId, status: 'running' },
      take: 1,
    });
    if (alreadyRunning.length > 0) {
      throw new BadRequestException(
        'A backup is already running for this target',
      );
    }

    const target = await this.targetModel.findUnique({
      where: { id: targetId },
    });
    if (!target) throw new NotFoundException(`Target ${targetId} not found`);

    const backup = await this.backupModel.create({
      data: {
        targetId,
        status: 'running',
        format: 'custom',
        triggeredByUserId: userId,
      },
    });

    this.runPgDump(backup.id, target).catch((err) => {
      this.logger.error(
        `Unexpected error running backup ${backup.id}: ${err.message}`,
      );
    });

    await this.audit.record({
      action: 'backup.start',
      userId,
      userEmail,
      targetId,
      detail: `backupId=${backup.id}`,
    });

    return serializeBackup(backup);
  }

  private async runPgDump(
    backupId: string,
    target: {
      id: string;
      host: string;
      port: number;
      database: string;
      username: string;
      passwordEncrypted: string;
      sslMode: string;
    },
  ): Promise<void> {
    const dir = join(BACKUP_DIR, target.id);
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `${backupId}.dump`);

    const password = decrypt(target.passwordEncrypted, getEncryptionKey());

    const args = [
      '--host',
      target.host,
      '--port',
      String(target.port),
      '--username',
      target.username,
      '--dbname',
      target.database,
      '--format',
      'custom',
      '--file',
      filePath,
      '--no-password',
    ];
    if (target.sslMode && target.sslMode !== 'disable') {
    }

    this.logger.log(`Starting pg_dump for target ${target.id} → ${filePath}`);

    const child = spawn('pg_dump', args, {
      env: {
        ...process.env,
        PGPASSWORD: password,
        PGSSLMODE: target.sslMode || 'prefer',
      },
    });
    this.runningProcesses.set(backupId, child);

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', async (code) => {
      this.runningProcesses.delete(backupId);
      try {
        if (code === 0) {
          const stats = await stat(filePath);
          await this.backupModel.update({
            where: { id: backupId },
            data: {
              status: 'completed',
              filePath,
              fileSizeBytes: BigInt(stats.size),
              completedAt: new Date(),
            },
          });
          this.logger.log(`Backup ${backupId} completed — ${stats.size} bytes`);
        } else {
          await this.backupModel.update({
            where: { id: backupId },
            data: {
              status: 'failed',
              errorMessage:
                stderr.trim().slice(0, 2000) ||
                `pg_dump exited with code ${code}`,
              completedAt: new Date(),
            },
          });
          this.logger.warn(
            `Backup ${backupId} failed (exit ${code}): ${stderr.slice(0, 200)}`,
          );
        }
      } catch (err) {
        this.logger.error(
          `Failed to update backup ${backupId} status: ${(err as Error).message}`,
        );
      }
    });

    child.on('error', async (err) => {
      this.runningProcesses.delete(backupId);
      await this.backupModel
        .update({
          where: { id: backupId },
          data: {
            status: 'failed',
            errorMessage: `pg_dump could not be started: ${err.message}. Is postgresql-client installed on the server?`,
            completedAt: new Date(),
          },
        })
        .catch(() => {});
    });
  }

  async list(targetId: string, limit = 50): Promise<SerializedBackup[]> {
    const backups = await this.backupModel.findMany({
      where: { targetId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return backups.map(serializeBackup);
  }

  async getDownloadStream(backupId: string) {
    const backup = await this.backupModel.findUnique({
      where: { id: backupId },
    });
    if (!backup) throw new NotFoundException('Backup not found');
    if (backup.status !== 'completed' || !backup.filePath) {
      throw new BadRequestException('Backup is not ready for download');
    }
    return { stream: createReadStream(backup.filePath), backup };
  }

  async remove(
    backupId: string,
    userId: string,
    userEmail: string,
  ): Promise<{ message: string }> {
    const backup = await this.backupModel.findUnique({
      where: { id: backupId },
    });
    if (!backup) throw new NotFoundException('Backup not found');

    const runningChild = this.runningProcesses.get(backupId);
    if (runningChild) {
      runningChild.kill('SIGTERM');
      this.runningProcesses.delete(backupId);
    }

    if (backup.filePath) {
      await unlink(backup.filePath).catch(() => {});
    }

    await this.backupModel.delete({ where: { id: backupId } });
    await this.audit.record({
      action: 'backup.delete',
      userId,
      userEmail,
      targetId: backup.targetId,
      detail: `backupId=${backupId}`,
    });

    return { message: 'Backup deleted' };
  }
}
