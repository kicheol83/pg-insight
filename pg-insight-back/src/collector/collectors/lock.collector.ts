import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { BaseCollector } from '../base.collector';
import { TargetPoolManager } from '../../targets/target-pool.manager';

export interface LockInfo {
  lockType: string;
  lockMode: string;
  granted: boolean;
  relationOid?: number;
  relationName?: string;
  schemaName?: string;
  relationKind?: string;
  pid: number;
  transactionId?: string;
  objId?: string;
  classId?: number;
  username: string;
  appName: string;
  state: string;
  queryMs: number;
  query?: string;
}

export interface BlockingRelation {
  blockerPid: number;
  blockerUsername: string;
  blockerApp: string;
  blockerQuery: string;
  blockerQueryMs: number;
  blockerState: string;

  waiters: Array<{
    waiterPid: number;
    waiterUsername: string;
    waiterApp: string;
    waiterQuery: string;
    waitMs: number;
    lockMode: string;
    lockType: string;
    relation?: string;
    schema?: string;
  }>;

  lockedRelation?: string;
  lockMode: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface LockSnapshot {
  totalLocks: number;
  waitingLocks: number;
  grantedLocks: number;
  byMode: Record<string, number>;
  byType: Record<string, number>;

  blockingChains: BlockingRelation[];
  hasBlockers: boolean;
  hasDeadlockRisk: boolean;

  waitingLockDetails: LockInfo[];

  advisoryLocks: Array<{
    pid: number;
    objId: string;
    granted: boolean;
    appName: string;
    lockLevel: 'session' | 'transaction';
  }>;
  deadlocksTotal: number;

  tablesUnderExclusiveLock: Array<{
    schemaName: string;
    tableName: string;
    holderPid: number;
    holderApp: string;
    waiters: number;
  }>;
}


@Injectable()
export class LockCollector extends BaseCollector<LockSnapshot> {
  protected readonly logger = new Logger(LockCollector.name);
  protected readonly name = 'LockCollector';

  constructor(poolManager: TargetPoolManager) {
    super(poolManager);
  }

  protected async collect(
    pool: Pool,
    _targetId: string,
  ): Promise<LockSnapshot> {
    const [locksResult, deadlocksResult] = await Promise.all([
      this.getAllLocks(pool),
      this.getDeadlockCount(pool),
    ]);

    const {
      allLocks,
      blockingChains,
      advisoryLocks,
      tablesUnderExclusiveLock,
    } = locksResult;

    const byMode: Record<string, number> = {};
    const byType: Record<string, number> = {};

    for (const lock of allLocks) {
      byMode[lock.lockMode] = (byMode[lock.lockMode] ?? 0) + 1;
      byType[lock.lockType] = (byType[lock.lockType] ?? 0) + 1;
    }

    const grantedLocks = allLocks.filter((l) => l.granted).length;
    const waitingLockDetails = allLocks.filter((l) => !l.granted);

    const hasDeadlockRisk = this.detectCircularDependency(blockingChains);

    return {
      totalLocks: allLocks.length,
      waitingLocks: waitingLockDetails.length,
      grantedLocks,
      byMode,
      byType,
      blockingChains,
      hasBlockers: blockingChains.length > 0,
      hasDeadlockRisk,
      waitingLockDetails,
      advisoryLocks,
      deadlocksTotal: deadlocksResult,
      tablesUnderExclusiveLock,
    };
  }

  private async getAllLocks(pool: Pool): Promise<{
    allLocks: LockInfo[];
    blockingChains: BlockingRelation[];
    advisoryLocks: LockSnapshot['advisoryLocks'];
    tablesUnderExclusiveLock: LockSnapshot['tablesUnderExclusiveLock'];
  }> {
    const locksResult = await pool.query<{
      locktype: string;
      mode: string;
      granted: boolean;
      relation: number | null;
      relname: string | null;
      nspname: string | null;
      relkind: string | null;
      pid: number;
      usename: string;
      application_name: string;
      state: string | null;
      query_duration_ms: string;
      query: string | null;
      virtualxid: string | null;
      transactionid: string | null;
      objid: string | null;
      classid: number | null;
    }>(`
      SELECT
        l.locktype,
        l.mode,
        l.granted,
        l.relation,
        c.relname,
        n.nspname,
        c.relkind,
        l.pid,
        COALESCE(a.usename, '')                               AS usename,
        COALESCE(a.application_name, '')                      AS application_name,
        COALESCE(a.state, 'unknown')                          AS state,
        COALESCE(
          EXTRACT(EPOCH FROM (CLOCK_TIMESTAMP() - a.query_start)) * 1000,
          0
        )::BIGINT                                             AS query_duration_ms,
        LEFT(a.query, 200)                                    AS query,
        l.virtualxid,
        l.transactionid::TEXT,
        l.objid::TEXT,
        l.classid

      FROM pg_locks l
      LEFT JOIN pg_stat_activity a ON a.pid = l.pid
      LEFT JOIN pg_class c ON c.oid = l.relation
      LEFT JOIN pg_namespace n ON n.oid = c.relnamespace

      WHERE
        l.pid <> pg_backend_pid()
        -- Juda ko'p internal lock'larni filtrlaymiz
        -- virtualxid lock — har process uchun, noise
        AND l.locktype <> 'virtualxid'

      ORDER BY l.granted ASC, query_duration_ms DESC
    `);

    const allLocks: LockInfo[] = locksResult.rows.map((row) => ({
      lockType: row.locktype,
      lockMode: row.mode,
      granted: row.granted,
      relationOid: row.relation ?? undefined,
      relationName: row.relname ?? undefined,
      schemaName: row.nspname ?? undefined,
      relationKind: row.relkind ?? undefined,
      pid: row.pid,
      transactionId: row.transactionid ?? undefined,
      objId: row.objid ?? undefined,
      classId: row.classid ?? undefined,
      username: row.usename,
      appName: row.application_name,
      state: row.state ?? 'unknown',
      queryMs: parseInt(row.query_duration_ms, 10),
      query: row.query ?? undefined,
    }));

   
    const chainResult = await pool
      .query<{
        blocker_pid: number;
        blocker_username: string;
        blocker_app: string;
        blocker_query: string;
        blocker_query_ms: string;
        blocker_state: string;
        waiter_pid: number;
        waiter_username: string;
        waiter_app: string;
        waiter_query: string;
        wait_ms: string;
        lock_mode: string;
        lock_type: string;
        relation_name: string | null;
        schema_name: string | null;
      }>(
        `
      SELECT
        -- Blocker (kim blok qilyabdi)
        blocker.pid                                           AS blocker_pid,
        COALESCE(blocker_a.usename, '')                       AS blocker_username,
        COALESCE(blocker_a.application_name, '')              AS blocker_app,
        COALESCE(LEFT(blocker_a.query, 300), '')              AS blocker_query,
        COALESCE(
          EXTRACT(EPOCH FROM (CLOCK_TIMESTAMP() - blocker_a.query_start)) * 1000, 0
        )::BIGINT                                             AS blocker_query_ms,
        COALESCE(blocker_a.state, 'unknown')                  AS blocker_state,

        -- Waiter (kim kutayabdi)
        waiter.pid                                            AS waiter_pid,
        COALESCE(waiter_a.usename, '')                        AS waiter_username,
        COALESCE(waiter_a.application_name, '')               AS waiter_app,
        COALESCE(LEFT(waiter_a.query, 300), '')               AS waiter_query,
        COALESCE(
          EXTRACT(EPOCH FROM (CLOCK_TIMESTAMP() - waiter_a.query_start)) * 1000, 0
        )::BIGINT                                             AS wait_ms,
        waiter.mode                                           AS lock_mode,
        waiter.locktype                                       AS lock_type,
        rel.relname                                           AS relation_name,
        ns.nspname                                            AS schema_name

      FROM pg_locks waiter

      -- Bloker pid'larni topamiz
      JOIN LATERAL UNNEST(pg_blocking_pids(waiter.pid)) AS blocker_pid ON TRUE
      JOIN pg_locks blocker ON blocker.pid = blocker_pid

      -- Activity ma'lumotlari
      JOIN pg_stat_activity waiter_a  ON waiter_a.pid  = waiter.pid
      JOIN pg_stat_activity blocker_a ON blocker_a.pid = blocker.pid

      -- Qaysi table (optional)
      LEFT JOIN pg_class rel ON rel.oid = waiter.relation
      LEFT JOIN pg_namespace ns ON ns.oid = rel.relnamespace

      WHERE
        NOT waiter.granted
        AND waiter.pid <> pg_backend_pid()

      ORDER BY wait_ms DESC
    `,
      )
      .catch(async () => {
        return pool.query<{
          blocker_pid: number;
          blocker_username: string;
          blocker_app: string;
          blocker_query: string;
          blocker_query_ms: string;
          blocker_state: string;
          waiter_pid: number;
          waiter_username: string;
          waiter_app: string;
          waiter_query: string;
          wait_ms: string;
          lock_mode: string;
          lock_type: string;
          relation_name: string | null;
          schema_name: string | null;
        }>(`
        SELECT
          blocker.pid AS blocker_pid,
          COALESCE(blocker_a.usename,'') AS blocker_username,
          COALESCE(blocker_a.application_name,'') AS blocker_app,
          COALESCE(LEFT(blocker_a.query,300),'') AS blocker_query,
          COALESCE(EXTRACT(EPOCH FROM(CLOCK_TIMESTAMP()-blocker_a.query_start))*1000,0)::BIGINT AS blocker_query_ms,
          COALESCE(blocker_a.state,'unknown') AS blocker_state,
          waiter.pid AS waiter_pid,
          COALESCE(waiter_a.usename,'') AS waiter_username,
          COALESCE(waiter_a.application_name,'') AS waiter_app,
          COALESCE(LEFT(waiter_a.query,300),'') AS waiter_query,
          COALESCE(EXTRACT(EPOCH FROM(CLOCK_TIMESTAMP()-waiter_a.query_start))*1000,0)::BIGINT AS wait_ms,
          waiter.mode AS lock_mode,
          waiter.locktype AS lock_type,
          c.relname AS relation_name,
          n.nspname AS schema_name
        FROM pg_locks waiter
        JOIN LATERAL UNNEST(pg_blocking_pids(waiter.pid)) AS blocker_pid ON TRUE
        JOIN pg_locks blocker ON blocker.pid=blocker_pid
        JOIN pg_stat_activity waiter_a ON waiter_a.pid=waiter.pid
        JOIN pg_stat_activity blocker_a ON blocker_a.pid=blocker.pid
        LEFT JOIN pg_class c ON c.oid=waiter.relation
        LEFT JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE NOT waiter.granted AND waiter.pid<>pg_backend_pid()
        ORDER BY wait_ms DESC
      `);
      });

    const chainMap = new Map<number, BlockingRelation>();

    for (const row of chainResult.rows) {
      const blockerPid = row.blocker_pid;
      const waitMs = parseInt(row.wait_ms, 10);

      if (!chainMap.has(blockerPid)) {
        const maxWaitMs = parseInt(row.blocker_query_ms, 10);
        let severity: BlockingRelation['severity'] = 'low';
        if (maxWaitMs >= 60_000)
          severity = 'critical'; 
        else if (maxWaitMs >= 10_000)
          severity = 'high'; 
        else if (maxWaitMs >= 3_000) severity = 'medium';

        chainMap.set(blockerPid, {
          blockerPid,
          blockerUsername: row.blocker_username,
          blockerApp: row.blocker_app,
          blockerQuery: row.blocker_query,
          blockerQueryMs: parseInt(row.blocker_query_ms, 10),
          blockerState: row.blocker_state,
          waiters: [],
          lockedRelation: row.relation_name ?? undefined,
          lockMode: row.lock_mode,
          severity,
        });
      }

      const chain = chainMap.get(blockerPid)!;
      chain.waiters.push({
        waiterPid: row.waiter_pid,
        waiterUsername: row.waiter_username,
        waiterApp: row.waiter_app,
        waiterQuery: row.waiter_query,
        waitMs,
        lockMode: row.lock_mode,
        lockType: row.lock_type,
        relation: row.relation_name ?? undefined,
        schema: row.schema_name ?? undefined,
      });

      if (chain.waiters.length >= 10) chain.severity = 'critical';
      else if (chain.waiters.length >= 5) {
        if (chain.severity === 'low') chain.severity = 'medium';
      }
    }

    const blockingChains = Array.from(chainMap.values());

    const advisoryResult = await pool.query<{
      pid: number;
      objid: string;
      granted: boolean;
      app: string;
      level: string;
    }>(`
      SELECT
        l.pid,
        l.objid::TEXT,
        l.granted,
        COALESCE(a.application_name, '') AS app,
        -- classid=0 → session level, !=0 → transaction level (heuristic)
        CASE WHEN l.classid = 0 THEN 'session' ELSE 'transaction' END AS level
      FROM pg_locks l
      LEFT JOIN pg_stat_activity a ON a.pid = l.pid
      WHERE l.locktype = 'advisory'
        AND l.pid <> pg_backend_pid()
    `);

    const advisoryLocks = advisoryResult.rows.map((row) => ({
      pid: row.pid,
      objId: row.objid,
      granted: row.granted,
      appName: row.app,
      lockLevel: row.level as 'session' | 'transaction',
    }));

    const exclusiveResult = await pool.query<{
      schema_name: string;
      table_name: string;
      holder_pid: number;
      holder_app: string;
      waiter_count: string;
    }>(`
      SELECT
        n.nspname                         AS schema_name,
        c.relname                         AS table_name,
        l.pid                             AS holder_pid,
        COALESCE(a.application_name, '')  AS holder_app,
        COUNT(waiting.pid)::TEXT          AS waiter_count
      FROM pg_locks l
      JOIN pg_class c ON c.oid = l.relation
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_stat_activity a ON a.pid = l.pid
      LEFT JOIN pg_locks waiting
        ON waiting.relation = l.relation
        AND NOT waiting.granted
      WHERE l.mode = 'AccessExclusiveLock'
        AND l.granted
        AND l.pid <> pg_backend_pid()
        AND c.relkind = 'r'  -- faqat regular table'lar
      GROUP BY n.nspname, c.relname, l.pid, a.application_name
    `);

    const tablesUnderExclusiveLock = exclusiveResult.rows.map((row) => ({
      schemaName: row.schema_name,
      tableName: row.table_name,
      holderPid: row.holder_pid,
      holderApp: row.holder_app,
      waiters: parseInt(row.waiter_count, 10),
    }));

    return {
      allLocks,
      blockingChains,
      advisoryLocks,
      tablesUnderExclusiveLock,
    };
  }

  private async getDeadlockCount(pool: Pool): Promise<number> {
    const result = await pool.query<{ deadlocks: string }>(`
      SELECT COALESCE(SUM(deadlocks), 0) AS deadlocks
      FROM pg_stat_database
      WHERE datname = current_database()
    `);
    return parseInt(result.rows[0].deadlocks, 10);
  }

  private detectCircularDependency(chains: BlockingRelation[]): boolean {
    const graph = new Map<number, Set<number>>();

    for (const chain of chains) {
      if (!graph.has(chain.blockerPid)) {
        graph.set(chain.blockerPid, new Set());
      }
      for (const waiter of chain.waiters) {
        graph.get(chain.blockerPid)!.add(waiter.waiterPid);
      }
    }

    const visited = new Set<number>();
    const inStack = new Set<number>();

    const hasCycle = (pid: number): boolean => {
      if (inStack.has(pid)) return true; 
      if (visited.has(pid)) return false; 

      visited.add(pid);
      inStack.add(pid);

      const neighbors = graph.get(pid) ?? new Set();
      for (const neighbor of neighbors) {
        if (hasCycle(neighbor)) return true;
      }

      inStack.delete(pid);
      return false;
    };

    for (const pid of graph.keys()) {
      if (!visited.has(pid) && hasCycle(pid)) {
        return true;
      }
    }

    return false;
  }
}
