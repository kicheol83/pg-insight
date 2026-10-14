jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import { BadRequestException, Logger } from '@nestjs/common';
import {
  AlertEngineService,
  ALERT_METRIC_NAMES,
  parseNotifyChannel,
} from './alert-engine.service';
import { CollectorOrchestrator } from '../collector/collector.orchestrator';
import { CreateAlertRuleDto } from './alerts.controller';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const TARGET_ID = '7386f99a-aa01-42a7-9527-f54cc48b0c9d';

function rule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-1',
    targetId: TARGET_ID,
    name: 'High connections',
    metric: 'connection_utilization_pct',
    operator: 'gte',
    threshold: 80,
    severity: 'warning',
    cooldownMs: 300_000,
    enabled: true,
    notifyChannels: [] as string[],
    ...overrides,
  };
}

function build(rules: ReturnType<typeof rule>[]) {
  const prisma = {
    alertRule: { findMany: jest.fn().mockResolvedValue(rules) },
    alertEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const realtime = { broadcastAlertEvaluation: jest.fn() };
  const hostPolicy = {
    resolve: jest.fn(async (host: string) => {
      if (host === '10.0.0.5' || host.endsWith('.internal')) {
        throw new BadRequestException('private');
      }
      return { address: '93.184.216.34', servername: host };
    }),
  };
  const engine = new AlertEngineService(
    prisma as never,
    realtime as never,
    hostPolicy as never,
  );
  return { engine, prisma, realtime, hostPolicy };
}

describe('AlertEngineService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('creates an event and broadcasts when a rule crosses its threshold', async () => {
    const { engine, prisma, realtime } = build([rule()]);

    await engine.evaluate(TARGET_ID, { connectionUtilizationPct: 91 });

    expect(prisma.alertEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetId: TARGET_ID,
        ruleId: 'rule-1',
        currentValue: 91,
      }),
    });
    expect(realtime.broadcastAlertEvaluation).toHaveBeenCalledTimes(1);
  });

  it('does not fire again inside the cooldown window', async () => {
    const { engine, prisma } = build([rule()]);

    await engine.evaluate(TARGET_ID, { connectionUtilizationPct: 91 });
    await engine.evaluate(TARGET_ID, { connectionUtilizationPct: 95 });

    expect(prisma.alertEvent.create).toHaveBeenCalledTimes(1);
  });

  it('resolves every open event of the rule once the value recovers, even after a restart', async () => {
    const { engine, prisma } = build([rule()]);

    await engine.evaluate(TARGET_ID, { connectionUtilizationPct: 40 });

    expect(prisma.alertEvent.updateMany).toHaveBeenCalledWith({
      where: { ruleId: 'rule-1', resolvedAt: null },
      data: { resolvedAt: expect.any(Date) },
    });
  });

  it('skips a rule whose metric has not been collected yet instead of resolving or firing it', async () => {
    const { engine, prisma } = build([
      rule({ metric: 'cache_hit_ratio', operator: 'lt', threshold: 0.9 }),
    ]);

    await engine.evaluate(TARGET_ID, {});

    expect(prisma.alertEvent.create).not.toHaveBeenCalled();
    expect(prisma.alertEvent.updateMany).not.toHaveBeenCalled();
  });

  it('posts to the webhook in the channel without following redirects', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as Response);
    const { engine, hostPolicy } = build([
      rule({ notifyChannels: ['webhook:https://hooks.example.com/a:b?x=1'] }),
    ]);

    await engine.evaluate(TARGET_ID, { connectionUtilizationPct: 99 });

    expect(hostPolicy.resolve).toHaveBeenCalledWith('hooks.example.com', false);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.example.com/a:b?x=1',
      expect.objectContaining({ method: 'POST', redirect: 'manual' }),
    );
  });

  it('never calls a webhook that resolves to a private address', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const { engine } = build([
      rule({ notifyChannels: ['webhook:http://10.0.0.5/hook'] }),
    ]);

    await engine.evaluate(TARGET_ID, { connectionUtilizationPct: 99 });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the whole URL after the channel type', () => {
    expect(parseNotifyChannel('webhook:https://h.example.com:8443/p')).toEqual({
      type: 'webhook',
      target: 'https://h.example.com:8443/p',
    });
    expect(parseNotifyChannel('https://no-type.example.com')).toEqual({
      type: 'https',
      target: '//no-type.example.com',
    });
    expect(parseNotifyChannel('nocolon')).toBeNull();
  });

  it.each([
    [['https://hooks.example.com/x']],
    [['webhook:ftp://hooks.example.com/x']],
    [['webhook:https://user:pw@hooks.example.com/x']],
    [['webhook:https://metadata.internal/x']],
    [['webhook:not a url']],
  ])('rejects the channel list %j', async (channels) => {
    const { engine } = build([]);
    await expect(engine.validateNotifyChannels(channels)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('accepts a public https webhook', async () => {
    const { engine } = build([]);
    await expect(
      engine.validateNotifyChannels(['webhook:https://hooks.example.com/x']),
    ).resolves.toBeUndefined();
  });

  it('reports metrics only for snapshots that exist and never as -Infinity', () => {
    const values = AlertEngineService.buildMetricValues({
      table: { tables: [] } as never,
    });

    expect(values.bloatPctMax).toBe(0);
    expect(values.connectionUtilizationPct).toBeUndefined();
    expect(values.cacheHitRatio).toBeUndefined();
  });

  it('turns replication state into sync quorum, archiving and slot alert values', () => {
    const values = AlertEngineService.buildMetricValues({
      replication: {
        isPrimary: true,
        syncRequired: 1,
        syncHealthy: 0,
        archiveFailing: true,
        archiveReadyCount: 7,
        maxInactiveSlotWalBytes: 2048,
        maxLagBytes: 0,
      } as never,
    });

    expect(values.syncStandbysMissing).toBe(1);
    expect(values.walArchiveFailing).toBe(1);
    expect(values.walArchiveReadyCount).toBe(7);
    expect(values.inactiveSlotWalBytes).toBe(2048);
  });

  it('does not report missing sync standbys for a standby target', () => {
    const values = AlertEngineService.buildMetricValues({
      replication: {
        isPrimary: false,
        syncRequired: 0,
        syncHealthy: 0,
        archiveFailing: false,
        archiveReadyCount: null,
        maxInactiveSlotWalBytes: 0,
        maxLagBytes: 0,
      } as never,
    });

    expect(values.syncStandbysMissing).toBeUndefined();
    expect(values.walArchiveFailing).toBe(0);
    expect(values.walArchiveReadyCount).toBeUndefined();
  });
});

describe('CreateAlertRuleDto', () => {
  it.each(ALERT_METRIC_NAMES.map((m) => [m]))(
    'accepts engine metric %s',
    async (metric) => {
      const dto = plainToInstance(CreateAlertRuleDto, {
        name: 'r',
        metric,
        operator: 'gt',
        threshold: 1,
        severity: 'warning',
      });
      expect(await validate(dto)).toHaveLength(0);
    },
  );

  it('rejects the old UI metric name connection_usage_pct', async () => {
    const dto = plainToInstance(CreateAlertRuleDto, {
      name: 'r',
      metric: 'connection_usage_pct',
      operator: 'gt',
      threshold: 1,
      severity: 'warning',
    });
    expect((await validate(dto)).map((e) => e.property)).toEqual(['metric']);
  });
});

describe('CollectorOrchestrator alert evaluation', () => {
  it('evaluates the latest snapshots and turns cumulative deadlocks into a delta', async () => {
    const evaluate = jest.fn().mockResolvedValue(undefined);
    const config = { get: (_k: string, fallback: unknown) => fallback };
    const unused = {} as never;
    const orchestrator = new CollectorOrchestrator(
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      config as never,
      { evaluate } as never,
    );
    const latest = (orchestrator as unknown as { latest: Map<string, object> })
      .latest;

    latest.set(TARGET_ID, {
      connection: { connectionUsagePct: 42 },
      lock: { deadlocksTotal: 7, waitingLocks: 0, blockingChains: [] },
    });
    await orchestrator.evaluateAlerts(TARGET_ID);
    latest.get(TARGET_ID)!['lock' as never] = {
      deadlocksTotal: 10,
      waitingLocks: 2,
      blockingChains: [],
    } as never;
    await orchestrator.evaluateAlerts(TARGET_ID);

    expect(evaluate.mock.calls[0][1]).toMatchObject({
      connectionUtilizationPct: 42,
      deadlocksDelta: undefined,
    });
    expect(evaluate.mock.calls[1][1]).toMatchObject({
      deadlocksDelta: 3,
      lockWaitCount: 2,
    });
  });

  it('does nothing for a target without collected data', async () => {
    const evaluate = jest.fn();
    const unused = {} as never;
    const orchestrator = new CollectorOrchestrator(
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      { get: (_k: string, f: unknown) => f } as never,
      { evaluate } as never,
    );

    await orchestrator.evaluateAlerts(TARGET_ID);

    expect(evaluate).not.toHaveBeenCalled();
  });
});
