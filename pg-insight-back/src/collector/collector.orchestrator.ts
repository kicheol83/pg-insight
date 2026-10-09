import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TargetPoolManager } from '../targets/target-pool.manager';
import { ConnectionCollector } from './collectors/connection.collector';
import { QueryCollector } from './collectors/query.collector';
import { LockCollector } from './collectors/lock.collector';
import { TableCollector } from './collectors/table.collector';
import { VacuumCollector } from './collectors/vacuum.collector';
import { ReplicationCollector } from './collectors/replication.collector';
import { IoBufferCollector } from './collectors/io-buffer.collector';
import { SystemCollector } from './collectors/system.collector';
import { MetricsWriterService } from '../metrics/writer/metrics-writer.service';
import { RealtimeGateway } from '../real-time/real-time.gateway';

interface TargetIntervals {
  targetId: string;
  connection?: NodeJS.Timeout;
  lock?: NodeJS.Timeout;
  query?: NodeJS.Timeout;
  table?: NodeJS.Timeout;
  vacuum?: NodeJS.Timeout;
  replication?: NodeJS.Timeout;
  ioBuffer?: NodeJS.Timeout;
  system?: NodeJS.Timeout;
}

interface TargetErrorState {
  consecutiveErrors: number;
  lastErrorAt?: Date;
  retryAt?: Date;
}

interface CollectionIntervals {
  connectionMs: number;
  lockMs: number;
  queryMs: number;
  tableMs: number;
  vacuumMs: number;
  replicationMs: number;
  ioBufferMs: number;
  systemMs: number;
}

const DEFAULT_INTERVALS: CollectionIntervals = {
  connectionMs: 5_000, 
  lockMs: 3_000, 
  queryMs: 15_000, 
  tableMs: 60_000, 
  vacuumMs: 30_000, 
  replicationMs: 5_000, 
  ioBufferMs: 10_000, 
  systemMs: 300_000, 
};

const MAX_CONSECUTIVE_ERRORS = 3;
const RETRY_DELAY_MS = 30_000; 
@Injectable()
export class CollectorOrchestrator implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CollectorOrchestrator.name);

  private readonly targetIntervals = new Map<string, TargetIntervals>();

  private readonly errorStates = new Map<string, TargetErrorState>();

  private readonly reconnectTimers = new Map<string, NodeJS.Timeout>();

  private readonly intervals: CollectionIntervals;

  constructor(
    private readonly poolManager: TargetPoolManager,
    private readonly connCollector: ConnectionCollector,
    private readonly queryCollector: QueryCollector,
    private readonly lockCollector: LockCollector,
    private readonly tableCollector: TableCollector,
    private readonly vacuumCollector: VacuumCollector,
    private readonly replicationCollector: ReplicationCollector,
    private readonly ioBufferCollector: IoBufferCollector,
    private readonly systemCollector: SystemCollector,
    private readonly metricsWriter: MetricsWriterService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly config: ConfigService,
  ) {
    this.intervals = {
      connectionMs: config.get(
        'collector.connectionMs',
        DEFAULT_INTERVALS.connectionMs,
      ),
      lockMs: config.get('collector.lockMs', DEFAULT_INTERVALS.lockMs),
      queryMs: config.get('collector.queryMs', DEFAULT_INTERVALS.queryMs),
      tableMs: config.get('collector.tableMs', DEFAULT_INTERVALS.tableMs),
      vacuumMs: config.get('collector.vacuumMs', DEFAULT_INTERVALS.vacuumMs),
      replicationMs: config.get(
        'collector.replicationMs',
        DEFAULT_INTERVALS.replicationMs,
      ),
      ioBufferMs: config.get(
        'collector.ioBufferMs',
        DEFAULT_INTERVALS.ioBufferMs,
      ),
      systemMs: config.get('collector.systemMs', DEFAULT_INTERVALS.systemMs),
    };
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('🎬 CollectorOrchestrator starting...');

    
    const entries = this.poolManager.getAllEntries();
    const activeTargets = entries.filter((e) => e.status === 'active');

    this.logger.log(
      `Starting collection for ${activeTargets.length} active target(s)`,
    );

    for (const entry of activeTargets) {
      await this.startCollection(entry.targetId);
    }

    this.logger.log(
      `Orchestrator running. Intervals: ` +
        `conn=${this.intervals.connectionMs}ms lock=${this.intervals.lockMs}ms ` +
        `query=${this.intervals.queryMs}ms`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('CollectorOrchestrator stopping...');

    for (const targetId of this.targetIntervals.keys()) {
      this.stopCollection(targetId);
    }

    this.targetIntervals.clear();
    this.logger.log('All collection intervals cleared');
  }


  async startCollection(targetId: string): Promise<void> {
    if (this.targetIntervals.has(targetId)) {
      this.logger.warn(
        `Collection already running for target: ${targetId.slice(0, 8)}`,
      );
      return;
    }

    this.logger.log(
      `▶Starting collection for target: ${targetId.slice(0, 8)}`,
    );

    this.errorStates.set(targetId, { consecutiveErrors: 0 });

    const intervals: TargetIntervals = { targetId };

    await this.runWithErrorTracking(targetId, () =>
      this.collectConnection(targetId),
    );
    await this.runWithErrorTracking(targetId, () => this.collectLock(targetId));

    intervals.connection = setInterval(
      () =>
        this.runWithErrorTracking(targetId, () =>
          this.collectConnection(targetId),
        ),
      this.intervals.connectionMs,
    );

    intervals.lock = setInterval(
      () =>
        this.runWithErrorTracking(targetId, () => this.collectLock(targetId)),
      this.intervals.lockMs,
    );

    intervals.query = setInterval(
      () =>
        this.runWithErrorTracking(targetId, () => this.collectQuery(targetId)),
      this.intervals.queryMs,
    );

    intervals.table = setInterval(
      () =>
        this.runWithErrorTracking(targetId, () => this.collectTable(targetId)),
      this.intervals.tableMs,
    );

    intervals.vacuum = setInterval(
      () =>
        this.runWithErrorTracking(targetId, () => this.collectVacuum(targetId)),
      this.intervals.vacuumMs,
    );

    intervals.replication = setInterval(
      () =>
        this.runWithErrorTracking(targetId, () =>
          this.collectReplication(targetId),
        ),
      this.intervals.replicationMs,
    );

    intervals.ioBuffer = setInterval(
      () =>
        this.runWithErrorTracking(targetId, () =>
          this.collectIoBuffer(targetId),
        ),
      this.intervals.ioBufferMs,
    );

    intervals.system = setInterval(
      () =>
        this.runWithErrorTracking(targetId, () => this.collectSystem(targetId)),
      this.intervals.systemMs,
    );

    this.targetIntervals.set(targetId, intervals);

    setTimeout(
      () =>
        this.runWithErrorTracking(targetId, () => this.collectSystem(targetId)),
      2000,
    );
  }

  stopCollection(targetId: string): void {
    const intervals = this.targetIntervals.get(targetId);
    if (!intervals) return;

    if (intervals.connection) clearInterval(intervals.connection);
    if (intervals.lock) clearInterval(intervals.lock);
    if (intervals.query) clearInterval(intervals.query);
    if (intervals.table) clearInterval(intervals.table);
    if (intervals.vacuum) clearInterval(intervals.vacuum);
    if (intervals.replication) clearInterval(intervals.replication);
    if (intervals.ioBuffer) clearInterval(intervals.ioBuffer);
    if (intervals.system) clearInterval(intervals.system);

    this.targetIntervals.delete(targetId);
    this.errorStates.delete(targetId);

    const reconnectTimer = this.reconnectTimers.get(targetId);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    this.reconnectTimers.delete(targetId);

    this.logger.log(
      `Collection stopped for target: ${targetId.slice(0, 8)}`,
    );
  }

  async refreshTarget(targetId: string): Promise<void> {
    this.logger.log(`🔄 Manual refresh for target: ${targetId.slice(0, 8)}`);

    await Promise.allSettled([
      this.collectConnection(targetId),
      this.collectLock(targetId),
      this.collectQuery(targetId),
    ]);
  }

  getActiveTargets(): string[] {
    return Array.from(this.targetIntervals.keys());
  }

  private async runWithErrorTracking(
    targetId: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    const errorState = this.errorStates.get(targetId);

    if (errorState?.retryAt && Date.now() < errorState.retryAt.getTime()) {
      return;
    }

    try {
      await fn();

      if (errorState && errorState.consecutiveErrors > 0) {
        errorState.consecutiveErrors = 0;
        errorState.retryAt = undefined;
        this.logger.log(
          `Target ${targetId.slice(0, 8)} recovered after errors`,
        );
      }
    } catch (error) {
      if (!errorState) return;

      errorState.consecutiveErrors++;
      errorState.lastErrorAt = new Date();

      this.logger.warn(
        `Target ${targetId.slice(0, 8)} collection error ` +
          `${errorState.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}: ` +
          `${(error as Error).message}`,
      );

      if (errorState.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        errorState.retryAt = new Date(Date.now() + RETRY_DELAY_MS);

        this.logger.error(
          `Target ${targetId.slice(0, 8)} failed ${errorState.consecutiveErrors}x. ` +
            `Pausing collection for ${RETRY_DELAY_MS / 1000}s. ` +
            `Error: ${(error as Error).message}`,
        );

        this.scheduleReconnect(targetId);
      }
    }
  }

  private scheduleReconnect(targetId: string): void {
    if (this.reconnectTimers.has(targetId)) return;

    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(targetId);
      if (!this.targetIntervals.has(targetId)) return;

      this.logger.log(
        `🔌 Attempting reconnect for target: ${targetId.slice(0, 8)}`,
      );
      try {
        await this.poolManager.reconnect(targetId);

        const errorState = this.errorStates.get(targetId);
        if (errorState) {
          errorState.consecutiveErrors = 0;
          errorState.retryAt = undefined;
        }
      } catch (err) {
        this.logger.error(
          `Reconnect failed for ${targetId.slice(0, 8)}: ${(err as Error).message}`,
        );
      }
    }, RETRY_DELAY_MS);

    this.reconnectTimers.set(targetId, timer);
  }


  private async collectConnection(targetId: string): Promise<void> {
    const result = await this.connCollector.run(targetId);
    if (!result.data) return;

    await this.metricsWriter.writeConnectionSnapshot(targetId, result.data);

    this.realtimeGateway.broadcastConnections(targetId, {
      total: result.data.totalConnections,
      active: result.data.activeQueries,
      idle: result.data.idleConnections,
      idleInTransaction: result.data.idleInTransaction,
      waiting: result.data.waitingForLock,
      maxConnections: result.data.maxConnections,
      utilizationPct: result.data.connectionUsagePct,
      timestamp: result.meta.collectedAt,
    });
  }

  private async collectLock(targetId: string): Promise<void> {
    const result = await this.lockCollector.run(targetId);
    if (!result.data) return;

    await this.metricsWriter.writeLockSnapshot(targetId, result.data);

    if (result.data.hasBlockers) {
      this.realtimeGateway.broadcastLockAlert(targetId, {
        hasBlockers: result.data.hasBlockers,
        hasDeadlockRisk: result.data.hasDeadlockRisk,
        totalWaiting: result.data.waitingLocks,
        blockingChains: result.data.blockingChains.slice(0, 5),
        timestamp: result.meta.collectedAt,
      });
    }
  }

  private async collectQuery(targetId: string): Promise<void> {
    const result = await this.queryCollector.run(targetId);
    if (!result.data) return;

    await this.metricsWriter.writeQuerySnapshot(targetId, result.data);

    const slowQueries = result.data.queries.filter((q) => q.isSlow);
    if (slowQueries.length > 0) {
      this.realtimeGateway.broadcastSlowQueries(targetId, {
        count: slowQueries.length,
        topSlow: slowQueries.slice(0, 5),
        timestamp: result.meta.collectedAt,
      });
    }
  }

  private async collectTable(targetId: string): Promise<void> {
    const result = await this.tableCollector.run(targetId);
    if (!result.data) return;

    await this.metricsWriter.writeTableSnapshot(targetId, result.data);

    const criticalBloat = result.data.tables.filter((t) => t.bloatRatio > 0.4);
    if (criticalBloat.length > 0) {
      this.realtimeGateway.broadcastTableAlert(targetId, {
        type: 'bloat',
        tables: criticalBloat.map((t) => ({
          name: `${t.schemaName}.${t.tableName}`,
          bloatRatio: t.bloatRatio,
        })),
        timestamp: result.meta.collectedAt,
      });
    }
  }

  private async collectVacuum(targetId: string): Promise<void> {
    const result = await this.vacuumCollector.run(targetId);
    if (!result.data) return;

    await this.metricsWriter.writeVacuumSnapshot(targetId, result.data);

    if (result.data.hasXidRisk) {
      this.realtimeGateway.broadcastVacuumAlert(targetId, {
        type: 'xid_wraparound',
        maxXidAge: result.data.maxXidAge,
        tables: result.data.xidAgeRisk.slice(0, 5),
        timestamp: result.meta.collectedAt,
      });
    }
  }

  private async collectReplication(targetId: string): Promise<void> {
    const result = await this.replicationCollector.run(targetId);
    if (!result.data) return;

    await this.metricsWriter.writeReplicationSnapshot(targetId, result.data);

    if (result.data.hasLaggedReplicas) {
      this.realtimeGateway.broadcastReplicationAlert(targetId, {
        maxLagBytes: result.data.maxLagBytes,
        replicas: result.data.replicas,
        timestamp: result.meta.collectedAt,
      });
    }
  }

  private async collectIoBuffer(targetId: string): Promise<void> {
    const result = await this.ioBufferCollector.run(targetId);
    if (!result.data) return;

    await this.metricsWriter.writeIoBufferSnapshot(targetId, result.data);
  }

  private async collectSystem(targetId: string): Promise<void> {
    const result = await this.systemCollector.run(targetId);
    if (!result.data) return;

    await this.metricsWriter.writeSystemSnapshot(targetId, result.data);
  }
}
