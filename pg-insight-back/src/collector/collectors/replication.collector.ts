import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { BaseCollector } from '../base.collector';
import { TargetPoolManager } from '../../targets/target-pool.manager';

export interface ReplicaInfo {
  pid: number;
  clientAddr: string;
  clientHostname: string | null;
  clientPort: number;
  username: string;
  applicationName: string;
  state: string;
  syncState: string;
  syncPriority: number;

  sentLsn: string;
  writeLsn: string;
  flushLsn: string;
  replayLsn: string;

  writeLagBytes: number;
  flushLagBytes: number;
  replayLagBytes: number;
  totalLagBytes: number;

  writeLagMs: number | null;
  flushLagMs: number | null;
  replayLagMs: number | null;

  replyTime: Date | null;
}

export interface ReplicationSlot {
  slotName: string;
  plugin: string | null;
  slotType: 'physical' | 'logical';
  database: string | null;
  active: boolean;
  activePid: number | null;
  xmin: string | null;
  catalogXmin: string | null;
  restartLsn: string;
  confirmedFlushLsn: string | null;
  walBytes: number;
  isBlocking: boolean;
}

export interface ReplicationSnapshot {
  isPrimary: boolean;
  hasReplicas: boolean;

  primaryLsn: string | null;
  walSizeBytes: number;

  replicas: ReplicaInfo[];
  maxLagBytes: number;
  hasLaggedReplicas: boolean; // > 100MB lag

  slots: ReplicationSlot[];
  hasInactiveSlots: boolean;
  totalWalRetained: number;

  receiverInfo: {
    status: string;
    primaryConnInfo: string;
    receivedLsn: string | null;
    lastMsgSendTime: Date | null;
    lastMsgReceiptTime: Date | null;
    latencyMs: number | null;
  } | null;
}

const LAG_WARNING_BYTES = 50 * 1024 * 1024; // 50MB
const LAG_CRITICAL_BYTES = 200 * 1024 * 1024; // 200MB

@Injectable()
export class ReplicationCollector extends BaseCollector<ReplicationSnapshot> {
  protected readonly logger = new Logger(ReplicationCollector.name);
  protected readonly name = 'ReplicationCollector';

  constructor(poolManager: TargetPoolManager) {
    super(poolManager);
  }

  protected async collect(
    pool: Pool,
    _targetId: string,
  ): Promise<ReplicationSnapshot> {
    const isPrimaryResult = await pool.query<{ is_primary: boolean }>(
      `SELECT pg_is_in_recovery() = FALSE AS is_primary`,
    );
    const isPrimary = isPrimaryResult.rows[0].is_primary;

    const [replicas, slots, receiverInfo] = await Promise.all([
      isPrimary ? this.getReplicaStats(pool) : Promise.resolve([]),
      this.getReplicationSlots(pool),
      isPrimary ? Promise.resolve(null) : this.getReceiverInfo(pool),
    ]);

    const lsnResult = await pool.query<{ lsn: string; wal_bytes: string }>(`
      SELECT
        pg_current_wal_lsn()::TEXT   AS lsn,
        -- WAL directory size (approximation)
        pg_wal_lsn_diff(
          pg_current_wal_lsn(),
          '0/0'
        )                            AS wal_bytes
    `);

    const maxLagBytes = replicas.reduce(
      (max, r) => Math.max(max, r.totalLagBytes),
      0,
    );
    const totalWalRetained = slots.reduce((sum, s) => sum + s.walBytes, 0);

    if (slots.some((s) => !s.active && s.walBytes > LAG_CRITICAL_BYTES)) {
      this.logger.warn(
        `Inactive replication slot retaining ${(totalWalRetained / 1024 / 1024).toFixed(0)}MB of WAL`,
      );
    }

    return {
      isPrimary,
      hasReplicas: replicas.length > 0,
      primaryLsn: isPrimary ? lsnResult.rows[0]?.lsn : null,
      walSizeBytes: isPrimary
        ? parseInt(lsnResult.rows[0]?.wal_bytes ?? '0', 10)
        : 0,
      replicas,
      maxLagBytes,
      hasLaggedReplicas: maxLagBytes > LAG_WARNING_BYTES,
      slots,
      hasInactiveSlots: slots.some((s) => !s.active),
      totalWalRetained,
      receiverInfo,
    };
  }

  private async getReplicaStats(pool: Pool): Promise<ReplicaInfo[]> {
    const result = await pool.query<{
      pid: number;
      client_addr: string;
      client_hostname: string | null;
      client_port: number;
      usename: string;
      application_name: string;
      state: string;
      sync_state: string;
      sync_priority: number;
      sent_lsn: string;
      write_lsn: string;
      flush_lsn: string;
      replay_lsn: string;
      write_lag_bytes: string;
      flush_lag_bytes: string;
      replay_lag_bytes: string;
      write_lag_ms: string | null;
      flush_lag_ms: string | null;
      replay_lag_ms: string | null;
      reply_time: Date | null;
    }>(`
      SELECT
        pid,
        client_addr::TEXT,
        client_hostname,
        COALESCE(client_port, 0) AS client_port,
        COALESCE(usename, '')    AS usename,
        COALESCE(application_name, '') AS application_name,
        state,
        sync_state,
        COALESCE(sync_priority, 0) AS sync_priority,
        sent_lsn::TEXT,
        write_lsn::TEXT,
        flush_lsn::TEXT,
        replay_lsn::TEXT,

        -- Lag in bytes
        COALESCE(
          pg_wal_lsn_diff(sent_lsn, write_lsn), 0
        ) AS write_lag_bytes,
        COALESCE(
          pg_wal_lsn_diff(sent_lsn, flush_lsn), 0
        ) AS flush_lag_bytes,
        COALESCE(
          pg_wal_lsn_diff(sent_lsn, replay_lsn), 0
        ) AS replay_lag_bytes,

        -- Lag in time (PostgreSQL 10+)
        COALESCE(
          EXTRACT(EPOCH FROM write_lag) * 1000, 0
        )::BIGINT AS write_lag_ms,
        COALESCE(
          EXTRACT(EPOCH FROM flush_lag) * 1000, 0
        )::BIGINT AS flush_lag_ms,
        COALESCE(
          EXTRACT(EPOCH FROM replay_lag) * 1000, 0
        )::BIGINT AS replay_lag_ms,

        reply_time

      FROM pg_stat_replication
      ORDER BY replay_lag_bytes DESC
    `);

    return result.rows.map((row) => {
      const writeLagBytes = parseInt(row.write_lag_bytes, 10);
      const flushLagBytes = parseInt(row.flush_lag_bytes, 10);
      const replayLagBytes = parseInt(row.replay_lag_bytes, 10);

      return {
        pid: row.pid,
        clientAddr: row.client_addr,
        clientHostname: row.client_hostname,
        clientPort: row.client_port,
        username: row.usename,
        applicationName: row.application_name,
        state: row.state,
        syncState: row.sync_state,
        syncPriority: row.sync_priority,
        sentLsn: row.sent_lsn,
        writeLsn: row.write_lsn,
        flushLsn: row.flush_lsn,
        replayLsn: row.replay_lsn,
        writeLagBytes,
        flushLagBytes,
        replayLagBytes,
        totalLagBytes: writeLagBytes + flushLagBytes + replayLagBytes,
        writeLagMs: row.write_lag_ms ? parseInt(row.write_lag_ms, 10) : null,
        flushLagMs: row.flush_lag_ms ? parseInt(row.flush_lag_ms, 10) : null,
        replayLagMs: row.replay_lag_ms ? parseInt(row.replay_lag_ms, 10) : null,
        replyTime: row.reply_time,
      };
    });
  }

  private async getReplicationSlots(pool: Pool): Promise<ReplicationSlot[]> {
    const result = await pool.query<{
      slot_name: string;
      plugin: string | null;
      slot_type: string;
      database: string | null;
      active: boolean;
      active_pid: number | null;
      xmin: string | null;
      catalog_xmin: string | null;
      restart_lsn: string;
      confirmed_flush_lsn: string | null;
      wal_status: string;
    }>(`
      SELECT
        slot_name,
        plugin,
        slot_type,
        database,
        active,
        active_pid,
        xmin::TEXT,
        catalog_xmin::TEXT,
        restart_lsn::TEXT,
        confirmed_flush_lsn::TEXT,
        -- PostgreSQL 13+ da safe_wal_size mavjud
        -- Biz approximate qilamiz
        COALESCE(wal_status, 'unknown') AS wal_status
      FROM pg_replication_slots
      ORDER BY active DESC, slot_name
    `);

    const walSizeResult = await pool
      .query<{
        slot_name: string;
        wal_bytes: string;
      }>(
        `
      SELECT
        slot_name,
        COALESCE(
          pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn),
          0
        ) AS wal_bytes
      FROM pg_replication_slots
    `,
      )
      .catch(() => ({
        rows: [] as { slot_name: string; wal_bytes: string }[],
      }));

    const walMap = new Map<string, number>(
      walSizeResult.rows.map((r) => [r.slot_name, parseInt(r.wal_bytes, 10)]),
    );

    return result.rows.map((row) => {
      const walBytes = walMap.get(row.slot_name) ?? 0;
      return {
        slotName: row.slot_name,
        plugin: row.plugin,
        slotType: row.slot_type as 'physical' | 'logical',
        database: row.database,
        active: row.active,
        activePid: row.active_pid,
        xmin: row.xmin,
        catalogXmin: row.catalog_xmin,
        restartLsn: row.restart_lsn,
        confirmedFlushLsn: row.confirmed_flush_lsn,
        walBytes,
        isBlocking: !row.active && walBytes > LAG_WARNING_BYTES,
      };
    });
  }

  private async getReceiverInfo(
    pool: Pool,
  ): Promise<ReplicationSnapshot['receiverInfo']> {
    const result = await pool
      .query<{
        status: string;
        conninfo: string;
        received_lsn: string | null;
        last_msg_send_time: Date | null;
        last_msg_receipt_time: Date | null;
        latency_ms: string | null;
      }>(
        `
      SELECT
        status,
        -- conninfo'dan password'ni olib tashlaymiz (security!)
        REGEXP_REPLACE(conninfo, 'password=[^ ]+', 'password=***') AS conninfo,
        received_lsn::TEXT,
        last_msg_send_time,
        last_msg_receipt_time,
        EXTRACT(EPOCH FROM (last_msg_receipt_time - last_msg_send_time))
          * 1000 AS latency_ms
      FROM pg_stat_wal_receiver
    `,
      )
      .catch(() => ({ rows: [] as never[] }));

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      status: row.status,
      primaryConnInfo: row.conninfo,
      receivedLsn: row.received_lsn,
      lastMsgSendTime: row.last_msg_send_time,
      lastMsgReceiptTime: row.last_msg_receipt_time,
      latencyMs: row.latency_ms ? parseFloat(row.latency_ms) : null,
    };
  }
}
