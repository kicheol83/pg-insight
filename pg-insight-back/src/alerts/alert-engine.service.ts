import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { ConnectionSnapshot } from '../collector/collectors/connection.collector';
import type { QuerySnapshot } from '../collector/collectors/query.collector';
import type { LockSnapshot } from '../collector/collectors/lock.collector';
import type { TableSnapshot } from '../collector/collectors/table.collector';
import type { VacuumSnapshot } from '../collector/collectors/vacuum.collector';
import type { ReplicationSnapshot } from '../collector/collectors/replication.collector';
import type { IoBufferSnapshot } from '../collector/collectors/io-buffer.collector';
import { RealtimeGateway } from '../real-time/real-time.gateway';

export type AlertMetricName =
  | 'connection_utilization_pct'
  | 'idle_in_tx_count'
  | 'idle_in_tx_max_ms'
  | 'active_query_count'
  | 'long_running_query_ms'
  | 'slow_query_count'
  | 'lock_wait_count'
  | 'lock_wait_max_ms'
  | 'deadlock_count'
  | 'bloat_pct_max'
  | 'xid_age_max'
  | 'replication_lag_bytes'
  | 'cache_hit_ratio'
  | 'checkpoint_pressure';

export type AlertOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface MetricValues {
  connectionUtilizationPct: number;
  idleInTxCount: number;
  idleInTxMaxMs: number;
  activeQueryCount: number;
  longRunningQueryMs: number;
  slowQueryCount: number;
  lockWaitCount: number;
  lockWaitMaxMs: number;
  deadlockCount: number;
  bloatPctMax: number;
  xidAgeMax: number;
  replicationLagBytes: number;
  cacheHitRatio: number;
  checkpointPressure: number;
}

export interface AlertRule {
  id: string;
  targetId: string;
  name: string;
  metric: string;
  operator: string;
  threshold: number;
  severity: string;
  cooldownMs: number;
  enabled: boolean;
  notifyChannels: string[];
}

export interface AlertTriggerResult {
  ruleId: string;
  targetId: string;
  ruleName: string;
  metric: string;
  operator: string;
  threshold: number;
  currentValue: number;
  severity: AlertSeverity;
  triggered: boolean;
  wasCooledDown: boolean;
}

@Injectable()
export class AlertEngineService {
  private readonly logger = new Logger(AlertEngineService.name);

  private readonly lastTriggerTimes = new Map<string, Date>();

  private readonly activeEventIds = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async evaluate(targetId: string, metrics: MetricValues): Promise<void> {
    const db = this.prisma as unknown as Record<string, unknown>;

    const rules = await (
      db['alertRule'] as {
        findMany: (args: unknown) => Promise<AlertRule[]>;
      }
    ).findMany({
      where: { targetId, enabled: true },
    });

    if (rules.length === 0) return;

    const results: AlertTriggerResult[] = [];

    for (const rule of rules) {
      const currentValue = this.getMetricValue(
        metrics,
        rule.metric as AlertMetricName,
      );

      if (currentValue === undefined) {
        this.logger.debug(`Unknown metric: ${rule.metric}`);
        continue;
      }

      const triggered = this.evaluateCondition(
        currentValue,
        rule.operator as AlertOperator,
        rule.threshold,
      );

      const result: AlertTriggerResult = {
        ruleId: rule.id,
        targetId: rule.targetId,
        ruleName: rule.name,
        metric: rule.metric,
        operator: rule.operator,
        threshold: rule.threshold,
        currentValue,
        severity: rule.severity as AlertSeverity,
        triggered,
        wasCooledDown: false,
      };

      if (triggered) {
        result.wasCooledDown = await this.handleTriggered(rule, currentValue);
      } else {
        await this.handleResolved(rule.id);
      }

      results.push(result);
    }

    const triggeredResults = results.filter(
      (r) => r.triggered && !r.wasCooledDown,
    );
    if (triggeredResults.length > 0) {
      this.realtime.broadcastAlertEvaluation(targetId, triggeredResults);
    }
  }

  private getMetricValue(
    metrics: MetricValues,
    metric: AlertMetricName,
  ): number | undefined {
    const map: Record<AlertMetricName, number> = {
      connection_utilization_pct: metrics.connectionUtilizationPct,
      idle_in_tx_count: metrics.idleInTxCount,
      idle_in_tx_max_ms: metrics.idleInTxMaxMs,
      active_query_count: metrics.activeQueryCount,
      long_running_query_ms: metrics.longRunningQueryMs,
      slow_query_count: metrics.slowQueryCount,
      lock_wait_count: metrics.lockWaitCount,
      lock_wait_max_ms: metrics.lockWaitMaxMs,
      deadlock_count: metrics.deadlockCount,
      bloat_pct_max: metrics.bloatPctMax,
      xid_age_max: metrics.xidAgeMax,
      replication_lag_bytes: metrics.replicationLagBytes,
      cache_hit_ratio: metrics.cacheHitRatio,
      checkpoint_pressure: metrics.checkpointPressure,
    };
    return map[metric];
  }

  private async handleTriggered(
    rule: AlertRule,
    currentValue: number,
  ): Promise<boolean> {
    // Cooldown tekshirish
    const lastTrigger = this.lastTriggerTimes.get(rule.id);
    if (lastTrigger) {
      const elapsedMs = Date.now() - lastTrigger.getTime();
      if (elapsedMs < rule.cooldownMs) {
        return true;
      }
    }

    this.lastTriggerTimes.set(rule.id, new Date());

    const message = this.buildAlertMessage(rule, currentValue);
    this.logger.warn(
      `Alert [${rule.severity.toUpperCase()}] ${rule.name} ` +
        `(${rule.metric}=${currentValue} ${rule.operator} ${rule.threshold})`,
    );

    const db = this.prisma as unknown as Record<string, unknown>;

    try {
      const event = await (
        db['alertEvent'] as {
          create: (args: unknown) => Promise<{ id: string }>;
        }
      ).create({
        data: {
          targetId: rule.targetId,
          ruleId: rule.id,
          currentValue,
          message,
        },
      });

      this.activeEventIds.set(rule.id, event.id);

      await this.sendNotifications(rule, currentValue, message);
    } catch (error) {
      this.logger.error(
        'Failed to save alert event:',
        (error as Error).message,
      );
    }

    return false;
  }

  private async handleResolved(ruleId: string): Promise<void> {
    const eventId = this.activeEventIds.get(ruleId);
    if (!eventId) return;

    const db = this.prisma as unknown as Record<string, unknown>;
    try {
      await (
        db['alertEvent'] as {
          update: (args: unknown) => Promise<unknown>;
        }
      ).update({
        where: { id: eventId },
        data: { resolvedAt: new Date() },
      });

      this.activeEventIds.delete(ruleId);
    } catch (error) {
      this.logger.error('Failed to resolve alert:', (error as Error).message);
    }
  }

  private evaluateCondition(
    value: number,
    operator: AlertOperator,
    threshold: number,
  ): boolean {
    switch (operator) {
      case 'gt':
        return value > threshold;
      case 'gte':
        return value >= threshold;
      case 'lt':
        return value < threshold;
      case 'lte':
        return value <= threshold;
      case 'eq':
        return Math.abs(value - threshold) < 0.001;
    }
  }

  private buildAlertMessage(rule: AlertRule, currentValue: number): string {
    const operatorText =
      {
        gt: 'exceeds',
        gte: 'reached or exceeds',
        lt: 'dropped below',
        lte: 'is at or below',
        eq: 'equals',
      }[rule.operator] ?? 'is';

    const metricLabels: Record<string, string> = {
      connection_utilization_pct: 'Connection utilization',
      idle_in_tx_count: 'Idle-in-transaction connections',
      idle_in_tx_max_ms: 'Max idle-in-transaction duration',
      slow_query_count: 'Slow query count',
      lock_wait_count: 'Lock wait count',
      lock_wait_max_ms: 'Max lock wait duration',
      deadlock_count: 'Deadlock count',
      bloat_pct_max: 'Table bloat ratio',
      xid_age_max: 'XID age (wraparound risk)',
      replication_lag_bytes: 'Replication lag',
      cache_hit_ratio: 'Buffer cache hit ratio',
      checkpoint_pressure: 'Checkpoint pressure',
    };

    const label = metricLabels[rule.metric] ?? rule.metric;
    return `${label} ${operatorText} threshold: ${currentValue} (threshold: ${rule.threshold})`;
  }

  private async sendNotifications(
    rule: AlertRule,
    currentValue: number,
    message: string,
  ): Promise<void> {
    for (const channel of rule.notifyChannels) {
      const [type, target] = channel.split(':', 2);

      try {
        switch (type) {
          case 'webhook':
            await this.sendWebhook(target, rule, currentValue, message);
            break;
          case 'email':
            this.logger.debug(
              `Email notification to ${target} (not yet implemented)`,
            );
            break;
          default:
            this.logger.warn(`Unknown notification channel: ${type}`);
        }
      } catch (error) {
        this.logger.error(
          `Failed to send notification via ${type}: ${(error as Error).message}`,
        );
      }
    }
  }

  private async sendWebhook(
    url: string,
    rule: AlertRule,
    currentValue: number,
    message: string,
  ): Promise<void> {
    const payload = {
      alert: {
        ruleId: rule.id,
        ruleName: rule.name,
        targetId: rule.targetId,
        metric: rule.metric,
        severity: rule.severity,
        currentValue,
        threshold: rule.threshold,
        message,
        timestamp: new Date().toISOString(),
      },
      text: `*PG Insight Alert* — ${rule.severity.toUpperCase()}\n${message}`,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}`);
    }
  }

  public static buildMetricValues(snapshots: {
    connection?: ConnectionSnapshot;
    query?: QuerySnapshot;
    lock?: LockSnapshot;
    table?: TableSnapshot;
    vacuum?: VacuumSnapshot;
    replication?: ReplicationSnapshot;
    ioBuffer?: IoBufferSnapshot;
  }): MetricValues {
    const conn = snapshots.connection;
    const lock = snapshots.lock;
    const tbl = snapshots.table;
    const vac = snapshots.vacuum;
    const rep = snapshots.replication;
    const io = snapshots.ioBuffer;

    return {
      connectionUtilizationPct: conn?.connectionUsagePct ?? 0,
      idleInTxCount: conn?.idleInTransaction ?? 0,
      idleInTxMaxMs: conn?.longestIdleInTxMs ?? 0,
      activeQueryCount: conn?.activeQueries ?? 0,
      longRunningQueryMs: conn?.longestQueryMs ?? 0,

      slowQueryCount:
        snapshots.query?.queries.filter((q) => q.isSlow).length ?? 0,

      lockWaitCount: lock?.waitingLocks ?? 0,
      lockWaitMaxMs:
        lock?.blockingChains.reduce(
          (max, c) => Math.max(max, ...c.waiters.map((w) => w.waitMs)),
          0,
        ) ?? 0,
      deadlockCount: lock?.deadlocksTotal ?? 0,

      bloatPctMax: tbl
        ? Math.max(...tbl.tables.map((t) => t.bloatRatio)) * 100
        : 0,

      xidAgeMax: vac?.maxXidAge ?? 0,

      replicationLagBytes: rep?.maxLagBytes ?? 0,

      cacheHitRatio: io?.cacheHitRatio ?? 1,
      checkpointPressure: io?.checkpointPressure ?? 0,
    };
  }

  public async getRules(targetId: string) {
    const db = this.prisma as unknown as Record<string, unknown>;
    return (
      db['alertRule'] as { findMany: (args: unknown) => Promise<AlertRule[]> }
    ).findMany({
      where: { targetId },
      orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
    });
  }

  public async createRule(data: {
    targetId: string;
    name: string;
    metric: AlertMetricName;
    operator: AlertOperator;
    threshold: number;
    severity: AlertSeverity;
    cooldownMs?: number;
    notifyChannels?: string[];
  }) {
    const db = this.prisma as unknown as Record<string, unknown>;
    return (
      db['alertRule'] as {
        create: (args: unknown) => Promise<AlertRule>;
      }
    ).create({ data });
  }

  public async deleteRule(id: string) {
    const db = this.prisma as unknown as Record<string, unknown>;
    return (
      db['alertRule'] as {
        delete: (args: unknown) => Promise<AlertRule>;
      }
    ).delete({ where: { id } });
  }

  public async getEvents(targetId: string, limit = 50) {
    const db = this.prisma as unknown as Record<string, unknown>;
    return (
      db['alertEvent'] as {
        findMany: (args: unknown) => Promise<unknown[]>;
      }
    ).findMany({
      where: { targetId },
      take: limit,
      orderBy: { triggeredAt: 'desc' },
      include: {
        rule: { select: { name: true, metric: true, severity: true } },
      },
    });
  }

  public async getActiveEvents(targetId: string) {
    const db = this.prisma as unknown as Record<string, unknown>;
    return (
      db['alertEvent'] as {
        findMany: (args: unknown) => Promise<unknown[]>;
      }
    ).findMany({
      where: { targetId, resolvedAt: null },
      orderBy: { triggeredAt: 'desc' },
      include: { rule: true },
    });
  }

  public async acknowledgeEvent(id: string) {
    const db = this.prisma as unknown as Record<string, unknown>;
    return (
      db['alertEvent'] as {
        update: (args: unknown) => Promise<unknown>;
      }
    ).update({
      where: { id },
      data: { acknowledged: true },
    });
  }

  public static getDefaultRules(targetId: string) {
    return [
      {
        targetId,
        name: 'High connection utilization',
        metric: 'connection_utilization_pct' as AlertMetricName,
        operator: 'gte' as AlertOperator,
        threshold: 80,
        severity: 'warning' as AlertSeverity,
        cooldownMs: 300_000,
      },
      {
        targetId,
        name: 'Critical connection utilization',
        metric: 'connection_utilization_pct' as AlertMetricName,
        operator: 'gte' as AlertOperator,
        threshold: 90,
        severity: 'critical' as AlertSeverity,
        cooldownMs: 60_000,
      },
      {
        targetId,
        name: 'Idle in transaction detected',
        metric: 'idle_in_tx_count' as AlertMetricName,
        operator: 'gte' as AlertOperator,
        threshold: 5,
        severity: 'warning' as AlertSeverity,
        cooldownMs: 300_000,
      },
      {
        targetId,
        name: 'Long idle in transaction (>30s)',
        metric: 'idle_in_tx_max_ms' as AlertMetricName,
        operator: 'gte' as AlertOperator,
        threshold: 30_000,
        severity: 'critical' as AlertSeverity,
        cooldownMs: 60_000,
      },
      {
        targetId,
        name: 'Lock wait detected',
        metric: 'lock_wait_count' as AlertMetricName,
        operator: 'gte' as AlertOperator,
        threshold: 3,
        severity: 'warning' as AlertSeverity,
        cooldownMs: 60_000,
      },
      {
        targetId,
        name: 'Table bloat critical (>40%)',
        metric: 'bloat_pct_max' as AlertMetricName,
        operator: 'gte' as AlertOperator,
        threshold: 40,
        severity: 'critical' as AlertSeverity,
        cooldownMs: 3_600_000, // 1 soat
      },
      {
        targetId,
        name: 'XID age warning (>500M)',
        metric: 'xid_age_max' as AlertMetricName,
        operator: 'gte' as AlertOperator,
        threshold: 500_000_000,
        severity: 'warning' as AlertSeverity,
        cooldownMs: 3_600_000,
      },
      {
        targetId,
        name: 'XID age critical (>1B)',
        metric: 'xid_age_max' as AlertMetricName,
        operator: 'gte' as AlertOperator,
        threshold: 1_000_000_000,
        severity: 'critical' as AlertSeverity,
        cooldownMs: 1_800_000,
      },
      {
        targetId,
        name: 'Low cache hit ratio (<90%)',
        metric: 'cache_hit_ratio' as AlertMetricName,
        operator: 'lt' as AlertOperator,
        threshold: 0.9,
        severity: 'warning' as AlertSeverity,
        cooldownMs: 1_800_000,
      },
      {
        targetId,
        name: 'High replication lag (>100MB)',
        metric: 'replication_lag_bytes' as AlertMetricName,
        operator: 'gte' as AlertOperator,
        threshold: 100 * 1024 * 1024,
        severity: 'critical' as AlertSeverity,
        cooldownMs: 300_000,
      },
    ];
  }
}
