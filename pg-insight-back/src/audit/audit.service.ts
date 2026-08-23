import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export type AuditAction =
  | 'login'
  | 'login_failed'
  | 'register_first'
  | 'register'
  | 'target.create'
  | 'target.delete'
  | 'target.update'
  | 'query.explain'
  | 'query.cancel'
  | 'backup.start'
  | 'backup.delete'
  | 'backup.download';

interface AuditEntry {
  userId?: string | null;
  userEmail?: string | null;
  action: AuditAction;
  targetId?: string | null;
  detail?: string | null;
  ipAddress?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get auditLogModel() {
    return (this.prisma as unknown as Record<string, unknown>)['auditLog'] as {
      create: (args: unknown) => Promise<unknown>;
      findMany: (args: unknown) => Promise<unknown[]>;
    };
  }

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.auditLogModel.create({ data: entry });
    } catch (error) {
      this.logger.error(
        `Failed to write audit log: ${(error as Error).message}`,
      );
    }
  }

  async list(filters: { userId?: string; targetId?: string; limit?: number }) {
    return this.auditLogModel.findMany({
      where: {
        ...(filters.userId ? { userId: filters.userId } : {}),
        ...(filters.targetId ? { targetId: filters.targetId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: filters.limit ?? 100,
    });
  }
}
