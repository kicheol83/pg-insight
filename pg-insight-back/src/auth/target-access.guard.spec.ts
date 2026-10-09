jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Public } from './public.decorator';
import { TargetAccess } from './target-access.decorator';
import { TargetAccessGuard } from './target-access.guard';
import { TargetAccessService } from './target-access.service';

const ALICE = { id: 'alice', role: 'user' };
const BOB = { id: 'bob', role: 'user' };
const ADMIN = { id: 'root', role: 'admin' };

const rows: Record<string, Record<string, Record<string, string | null>>> = {
  target: {
    'alice-db': { createdByUserId: 'alice' },
    'bob-db': { createdByUserId: 'bob' },
  },
  alertRule: { 'rule-of-bob': { targetId: 'bob-db' } },
  alertEvent: { 'event-of-alice': { targetId: 'alice-db' } },
  backup: {
    'backup-of-alice': { targetId: 'alice-db' },
    'backup-of-bob': { targetId: 'bob-db' },
  },
};

const prisma = Object.fromEntries(
  Object.entries(rows).map(([model, table]) => [
    model,
    {
      findUnique: jest.fn(
        async ({ where }: { where: { id: string } }) => table[where.id] ?? null,
      ),
    },
  ]),
);

class Routes {
  byTargetId() {}
  @TargetAccess('id')
  byTargetIdParam() {}
  @TargetAccess('id', 'alertRule')
  byAlertRule() {}
  @TargetAccess('id', 'alertEvent')
  byAlertEvent() {}
  @TargetAccess('backupId', 'backup')
  byBackup() {}
  @Public()
  publicRoute() {}
  unrelated() {}
}

function run(
  handler: keyof Routes,
  params: Record<string, string>,
  user?: { id: string; role: string },
) {
  const guard = new TargetAccessGuard(
    new Reflector(),
    new TargetAccessService(prisma as never),
  );
  const request = { params, user };
  const context = new ExecutionContextHost([request, {}, () => undefined]);
  context.setType('http');
  jest.spyOn(context, 'getHandler').mockReturnValue(Routes.prototype[handler]);
  jest.spyOn(context, 'getClass').mockReturnValue(Routes);
  return guard.canActivate(context);
}

describe('TargetAccessGuard', () => {
  afterEach(() => jest.clearAllMocks());

  it('lets an owner reach their own target', async () => {
    await expect(
      run('byTargetId', { targetId: 'alice-db' }, ALICE),
    ).resolves.toBe(true);
  });

  it("hides another user's target behind a 404", async () => {
    await expect(
      run('byTargetId', { targetId: 'bob-db' }, ALICE),
    ).rejects.toThrow(NotFoundException);
  });

  it('answers a missing target with the same 404', async () => {
    await expect(
      run('byTargetId', { targetId: 'nope' }, ALICE),
    ).rejects.toThrow(NotFoundException);
  });

  it('lets the platform admin reach any target', async () => {
    await expect(
      run('byTargetId', { targetId: 'bob-db' }, ADMIN),
    ).resolves.toBe(true);
  });

  it('checks a target addressed through a declared :id parameter', async () => {
    await expect(
      run('byTargetIdParam', { id: 'bob-db' }, ALICE),
    ).rejects.toThrow(NotFoundException);
    await expect(
      run('byTargetIdParam', { id: 'alice-db' }, ALICE),
    ).resolves.toBe(true);
  });

  it('resolves alert rules and events to their target', async () => {
    await expect(
      run('byAlertRule', { id: 'rule-of-bob' }, ALICE),
    ).rejects.toThrow(NotFoundException);
    await expect(
      run('byAlertEvent', { id: 'event-of-alice' }, ALICE),
    ).resolves.toBe(true);
  });

  it("rejects another tenant's backup even under the caller's own target URL", async () => {
    await expect(
      run(
        'byBackup',
        { targetId: 'alice-db', backupId: 'backup-of-bob' },
        ALICE,
      ),
    ).rejects.toThrow(NotFoundException);
    await expect(
      run(
        'byBackup',
        { targetId: 'alice-db', backupId: 'backup-of-alice' },
        ALICE,
      ),
    ).resolves.toBe(true);
  });

  it('skips routes that address no target and public routes', async () => {
    await expect(run('unrelated', {}, BOB)).resolves.toBe(true);
    await expect(run('publicRoute', { targetId: 'bob-db' })).resolves.toBe(
      true,
    );
    expect(prisma.target.findUnique).not.toHaveBeenCalled();
  });
});
