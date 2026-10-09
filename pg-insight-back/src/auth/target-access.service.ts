import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { TargetSource } from './target-access.decorator';

export interface TargetActor {
  id: string;
  role: string;
}

type Delegate = {
  findUnique: (args: unknown) => Promise<Record<string, string | null> | null>;
};

@Injectable()
export class TargetAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveTargetId(
    source: TargetSource,
    id: string,
  ): Promise<string | null> {
    if (source === 'target') return id;
    const row = await this.delegate(source).findUnique({
      where: { id },
      select: { targetId: true },
    });
    return row?.targetId ?? null;
  }

  async canAccess(actor: TargetActor, targetId: string): Promise<boolean> {
    const target = await this.delegate('target').findUnique({
      where: { id: targetId },
      select: { createdByUserId: true },
    });
    if (target === null) return false;
    return actor.role === 'admin' || target.createdByUserId === actor.id;
  }

  private delegate(name: TargetSource): Delegate {
    return (this.prisma as unknown as Record<string, Delegate>)[name];
  }
}
