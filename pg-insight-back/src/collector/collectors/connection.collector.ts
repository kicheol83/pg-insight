import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { BaseCollector } from '../base.collector';
import { TargetPoolManager } from '../../targets/target-pool.manager';

export interface SessionInfo {
  pid: number;
  username: string;
  applicationName: string;
  clientAddr: string | null;
  clientPort: number | null;
  dbName: string;
  state: string;
  waitEventType: string | null;
  waitEvent: string | null;
  queryStart: Date | null;
  xactStart: Date | null;
  backendStart: Date | null;
  queryDurationMs: number;
  xactDurationMs: number;
  query: string | null;
  backendType: string;
  isLongRunning: boolean;
  isIdleInTx: boolean;
  isWaitingForLock: boolean;
}

export interface ConnectionStateBreakdown {
  state: string;
  count: number;
}

export interface WaitEventBreakdown {
  waitEventType: string;
  waitEvent: string | null;
  count: number;
}

export interface ConnectionSnapshot {
  totalConnections: number;
  activeQueries: number;
  idleConnections: number;
  idleInTransaction: number;
  waitingForLock: number;
  maxConnections: number;
  connectionUsagePct: number;

  byState: ConnectionStateBreakdown[];
  byWaitEvent: WaitEventBreakdown[];

  byApplication: Array<{ applicationName: string; count: number }>;

  sessions: SessionInfo[];

  longestQueryMs: number;
  longestIdleInTxMs: number;
  hasLockWaiters: boolean;
  idleInTxAbortedCount: number;
}

@Injectable()
export class ConnectionCollector extends BaseCollector<ConnectionSnapshot> {
  protected readonly logger = new Logger(ConnectionCollector.name);
  protected readonly name = 'ConnectionCollector';

  private readonly longRunningThresholdMs = 30_000;

  constructor(poolManager: TargetPoolManager) {
    super(poolManager);
  }

  protected async collect(
    pool: Pool,
    _targetId: string,
  ): Promise<ConnectionSnapshot> {
    const maxConnResult = await pool.query<{ max_connections: string }>(
      'SHOW max_connections',
    );
    const maxConnections = parseInt(maxConnResult.rows[0].max_connections, 10);

    const activityResult = await pool.query<{
      pid: number;
      usename: string;
      application_name: string;
      client_addr: string | null;
      client_port: number | null;
      datname: string;
      state: string | null;
      wait_event_type: string | null;
      wait_event: string | null;
      query_start: Date | null;
      xact_start: Date | null;
      backend_start: Date | null;
      query_duration_ms: string;
      xact_duration_ms: string;
      query: string | null;
      backend_type: string;
    }>(`
      SELECT
        pid,
        COALESCE(usename, '')                                   AS usename,
        COALESCE(application_name, '')                          AS application_name,
        client_addr::TEXT,
        client_port,
        COALESCE(datname, '')                                   AS datname,
        state,
        wait_event_type,
        wait_event,
        query_start,
        xact_start,
        backend_start,

        -- query_duration_ms: query qancha vaqt ishlayabdi (ms)
        -- query_start NULL bo'lsa 0 qaytaramiz
        COALESCE(
          EXTRACT(EPOCH FROM (CLOCK_TIMESTAMP() - query_start)) * 1000,
          0
        )::BIGINT                                               AS query_duration_ms,

        -- xact_duration_ms: transaction qanchadan beri ochiq (ms)
        -- Bu idle-in-transaction uchun muhim!
        COALESCE(
          EXTRACT(EPOCH FROM (CLOCK_TIMESTAMP() - xact_start)) * 1000,
          0
        )::BIGINT                                               AS xact_duration_ms,

        -- Query text'ni 500 char bilan cheklaymiz
        -- 500 char tashxis uchun yetarli, xotira tejash uchun kerak
        LEFT(query, 500)                                        AS query,

        -- backend_type — backend nima?
        -- client backend   — oddiy user connection
        -- autovacuum worker — autovacuum
        -- autovacuum launcher — autovacuum scheduler
        -- background worker  — pg_cron, logical replication worker...
        -- walsender          — replica uchun WAL yuboryabdi
        -- walreceiver        — replica WAL olayabdi
        -- checkpointer       — checkpoint bajarayabdi
        -- logger             — log yozayabdi
        COALESCE(backend_type, 'unknown')                       AS backend_type

      FROM pg_stat_activity

      WHERE
        -- O'zimizni o'zimiz ko'rmaymiz
        pid <> pg_backend_pid()
        -- NULL state — just connected, hali state'ga kirmagan
        -- AND (state IS NOT NULL OR backend_type <> 'client backend')

      ORDER BY
        -- Eng uzoq ishlayotganlar birinchi (muhimroq)
        query_duration_ms DESC,
        xact_duration_ms DESC
    `);

    const sessions: SessionInfo[] = activityResult.rows.map((row) => {
      const queryDurationMs = parseInt(row.query_duration_ms, 10);
      const xactDurationMs = parseInt(row.xact_duration_ms, 10);
      const state = row.state ?? 'unknown';

      return {
        pid: row.pid,
        username: row.usename,
        applicationName: row.application_name,
        clientAddr: row.client_addr,
        clientPort: row.client_port,
        dbName: row.datname,
        state,
        waitEventType: row.wait_event_type,
        waitEvent: row.wait_event,
        queryStart: row.query_start,
        xactStart: row.xact_start,
        backendStart: row.backend_start,
        queryDurationMs,
        xactDurationMs,
        query: row.query,
        backendType: row.backend_type,

        isLongRunning:
          state === 'active' && queryDurationMs >= this.longRunningThresholdMs,
        isIdleInTx: state.startsWith('idle in transaction'),
        isWaitingForLock: row.wait_event_type === 'Lock',
      };
    });

    const stateMap = new Map<string, number>();
    for (const s of sessions) {
      const k = s.state;
      stateMap.set(k, (stateMap.get(k) ?? 0) + 1);
    }
    const byState: ConnectionStateBreakdown[] = Array.from(stateMap.entries())
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count);

    const waitMap = new Map<string, number>();
    for (const s of sessions) {
      if (s.waitEventType) {
        const k = `${s.waitEventType}::${s.waitEvent ?? ''}`;
        waitMap.set(k, (waitMap.get(k) ?? 0) + 1);
      }
    }
    const byWaitEvent: WaitEventBreakdown[] = Array.from(waitMap.entries())
      .map(([key, count]) => {
        const [waitEventType, waitEvent] = key.split('::');
        return { waitEventType, waitEvent: waitEvent || null, count };
      })
      .sort((a, b) => b.count - a.count);

    const appMap = new Map<string, number>();
    for (const s of sessions) {
      if (s.applicationName) {
        appMap.set(s.applicationName, (appMap.get(s.applicationName) ?? 0) + 1);
      }
    }
    const byApplication = Array.from(appMap.entries())
      .map(([applicationName, count]) => ({ applicationName, count }))
      .sort((a, b) => b.count - a.count);

    const totalConnections = sessions.length;
    const activeQueries = sessions.filter((s) => s.state === 'active').length;
    const idleConnections = sessions.filter((s) => s.state === 'idle').length;
    const idleInTransaction = sessions.filter((s) => s.isIdleInTx).length;
    const waitingForLock = sessions.filter((s) => s.isWaitingForLock).length;
    const idleInTxAbortedCount = sessions.filter(
      (s) => s.state === 'idle in transaction (aborted)',
    ).length;

    const longestQueryMs = sessions
      .filter((s) => s.state === 'active')
      .reduce((max, s) => Math.max(max, s.queryDurationMs), 0);

    const longestIdleInTxMs = sessions
      .filter((s) => s.isIdleInTx)
      .reduce((max, s) => Math.max(max, s.xactDurationMs), 0);

    return {
      totalConnections,
      activeQueries,
      idleConnections,
      idleInTransaction,
      waitingForLock,
      maxConnections,
      connectionUsagePct: Math.round((totalConnections / maxConnections) * 100),
      byState,
      byWaitEvent,
      byApplication,
      sessions,
      longestQueryMs,
      longestIdleInTxMs,
      hasLockWaiters: waitingForLock > 0,
      idleInTxAbortedCount,
    };
  }
}
