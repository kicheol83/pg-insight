import { Test } from '@nestjs/testing';
import {
  LiveQueryService,
  parseRequiredSyncStandbys,
  replicationHealthFactors,
} from './live-query.service';
import { TargetPoolManager } from '../targets/target-pool.manager';
import { PrismaService } from '../database/prisma.service';

type Router = (
  sql: string,
  params?: unknown[],
) => unknown[] | Promise<unknown[]>;

async function buildService(
  route: Router,
  client?: { query: jest.Mock; release: jest.Mock },
) {
  const poolManager = {
    query: jest.fn(async (_id: string, sql: string, params?: unknown[]) =>
      route(sql, params),
    ),
    getEntry: jest.fn(),
    getPool: jest
      .fn()
      .mockReturnValue(
        client ? { connect: jest.fn().mockResolvedValue(client) } : null,
      ),
  };
  const module = await Test.createTestingModule({
    providers: [
      LiveQueryService,
      { provide: TargetPoolManager, useValue: poolManager },
      { provide: PrismaService, useValue: {} },
    ],
  }).compile();
  return { service: module.get(LiveQueryService), poolManager };
}

const primaryStatus = (syncNames: string, archiveMode = 'on') => [
  { is_recovery: false, sync_names: syncNames, archive_mode: archiveMode },
];

const replicaRow = (name: string, overrides: Record<string, unknown> = {}) => ({
  pid: 100,
  client_addr: '172.30.1.12',
  application_name: name,
  state: 'streaming',
  sync_state: 'quorum',
  sync_priority: 1,
  write_lag_bytes: '0',
  flush_lag_bytes: '0',
  replay_lag_bytes: '0',
  total_lag_bytes: '1024',
  write_lag_ms: '1',
  flush_lag_ms: '1',
  replay_lag_ms: '2',
  reply_time: new Date().toISOString(),
  reply_age_s: '0.4',
  ...overrides,
});

const archiverRow = (overrides: Record<string, unknown> = {}) => ({
  archived_count: '40',
  last_archived_wal: '00000001000000000000002A',
  last_archived_time: '2026-10-12T10:00:00Z',
  failed_count: '0',
  last_failed_wal: null,
  last_failed_time: null,
  last_archived_age_s: '30',
  ...overrides,
});

describe('parseRequiredSyncStandbys', () => {
  it.each([
    ['', 0],
    ['pg2', 1],
    ['pg2, pg3', 1],
    ['*', 1],
    ['FIRST 1 (pg2)', 1],
    ['ANY 2 (pg1, pg2, pg3)', 2],
    ['any 1 ("pg-2", pg3)', 1],
    ['2 (pg2, pg3)', 2],
  ])('%s requires %d standbys', (value, expected) => {
    expect(parseRequiredSyncStandbys(value)).toBe(expected);
  });
});

describe('LiveQueryService - getReplication', () => {
  it('reports a satisfied ANY 1 quorum, WAL directory size and archiver state on a primary', async () => {
    const { service } = await buildService((sql) => {
      if (sql.includes('pg_is_in_recovery'))
        return primaryStatus('ANY 1 (pg1, pg2, pg3)');
      if (sql.includes('pg_ls_waldir'))
        return [{ size: String(64 * 1024 ** 2) }];
      if (sql.includes('pg_stat_replication'))
        return [
          replicaRow('pg2'),
          replicaRow('pg3', { pid: 101, reply_age_s: '25' }),
        ];
      if (sql.includes('pg_replication_slots'))
        return [
          {
            slot_name: 'repmgr_slot_2',
            slot_type: 'physical',
            plugin: null,
            active: true,
            active_pid: 100,
            database: null,
            wal_status: 'reserved',
            safe_wal_size: null,
            wal_bytes: '2048',
          },
        ];
      if (sql.includes('pg_stat_archiver')) return [archiverRow()];
      if (sql.includes('pg_ls_archive_statusdir')) return [{ ready: '1' }];
      return [];
    });

    const report = await service.getReplication('t1');

    expect(report.isPrimary).toBe(true);
    expect(report.walSizeBytes).toBe(64 * 1024 ** 2);
    expect(report.synchronous).toEqual({
      standbyNames: 'ANY 1 (pg1, pg2, pg3)',
      required: 1,
      healthy: 1,
      satisfied: true,
    });
    expect(report.replicas[0].totalLagBytes).toBe(1024);
    expect(report.slots[0].walStatus).toBe('reserved');
    expect(report.archiver).toMatchObject({
      enabled: true,
      failing: false,
      readyCount: 1,
      lastArchivedWal: '00000001000000000000002A',
    });
    expect(report.standby).toBeNull();
  });

  it('never calls pg_current_wal_lsn on a standby and reports receive/replay positions', async () => {
    const seen: string[] = [];
    const { service } = await buildService((sql) => {
      seen.push(sql);
      if (sql.includes('pg_is_in_recovery') && sql.includes('sync_names'))
        return [{ is_recovery: true, sync_names: '', archive_mode: 'on' }];
      if (sql.includes('pg_current_wal_lsn'))
        throw new Error('recovery is in progress');
      if (sql.includes('pg_replication_slots'))
        return [
          {
            slot_name: 'repmgr_slot_3',
            slot_type: 'physical',
            plugin: null,
            active: false,
            active_pid: null,
            database: null,
            wal_status: 'reserved',
            safe_wal_size: null,
            wal_bytes: '4096',
          },
        ];
      if (sql.includes('pg_stat_wal_receiver'))
        return [
          {
            status: 'streaming',
            received_lsn: '0/3000060',
            latency_ms: '120',
            last_msg_receipt_time: new Date().toISOString(),
            sender_host: 'pg1-db',
            sender_port: '5432',
            slot_name: 'repmgr_slot_2',
          },
        ];
      if (sql.includes('pg_last_wal_replay_lsn'))
        return [
          {
            receive_lsn: '0/3000060',
            replay_lsn: '0/3000000',
            replay_gap_bytes: '96',
            last_replay_at: null,
            replay_delay_s: null,
            paused: false,
          },
        ];
      if (sql.includes('pg_stat_archiver')) return [archiverRow()];
      return [];
    });

    const report = await service.getReplication('t1');

    expect(report.isPrimary).toBe(false);
    expect(seen.some((s) => s.includes('pg_current_wal_lsn'))).toBe(false);
    expect(report.slots).toHaveLength(1);
    expect(report.receiverInfo?.senderHost).toBe('pg1-db');
    expect(report.standby).toMatchObject({ replayGapBytes: 96, paused: false });
    expect(report.archiver.enabled).toBe(false);
    expect(report.synchronous).toBeNull();
  });

  it('flags archiving as failing when the last failure is newer than the last success', async () => {
    const { service } = await buildService((sql) => {
      if (sql.includes('pg_is_in_recovery')) return primaryStatus('');
      if (sql.includes('pg_stat_archiver'))
        return [
          archiverRow({
            failed_count: '7',
            last_failed_wal: '00000001000000000000002B',
            last_failed_time: '2026-10-12T10:05:00Z',
          }),
        ];
      if (sql.includes('pg_ls_archive_statusdir')) return [{ ready: '3' }];
      return [];
    });

    const report = await service.getReplication('t1');

    expect(report.archiver.failing).toBe(true);
    expect(report.archiver.failedCount).toBe(7);
  });
});

describe('replicationHealthFactors', () => {
  const base = {
    isPrimary: true,
    hasReplicas: true,
    primaryLsn: null,
    walSizeBytes: 0,
    replicas: [],
    maxLagBytes: 0,
    hasLaggedReplicas: false,
    slots: [] as never[],
    hasInactiveSlots: false,
    totalWalRetained: 0,
    receiverInfo: null,
    standby: null,
    synchronous: null,
    archiver: {
      mode: 'on',
      enabled: true,
      archivedCount: 1,
      lastArchivedWal: 'A',
      lastArchivedTime: null,
      lastArchivedAgeSec: 1,
      failedCount: 0,
      lastFailedWal: null,
      lastFailedTime: null,
      readyCount: 0,
      failing: false,
    },
  };

  it('deducts 20 points when the synchronous quorum is not met', () => {
    const factors = replicationHealthFactors({
      ...base,
      synchronous: {
        standbyNames: 'ANY 1 (pg2, pg3)',
        required: 1,
        healthy: 0,
        satisfied: false,
      },
    } as never);
    const sync = factors.find((f) => f.id === 'sync_quorum')!;
    expect(sync.status).toBe('critical');
    expect(sync.impact).toBe(-20);
    expect(sync.params).toMatchObject({ healthy: 0, required: 1 });
  });

  it('marks archiving critical while archive_command keeps failing', () => {
    const factors = replicationHealthFactors({
      ...base,
      archiver: {
        ...base.archiver,
        failing: true,
        failedCount: 3,
        lastFailedWal: 'B',
      },
    } as never);
    const archiving = factors.find((f) => f.id === 'wal_archiving')!;
    expect(archiving.status).toBe('critical');
    expect(archiving.code).toBe('failing');
  });

  it('warns about an archive backlog', () => {
    const factors = replicationHealthFactors({
      ...base,
      archiver: { ...base.archiver, readyCount: 50 },
    } as never);
    expect(factors.find((f) => f.id === 'wal_archiving')!.code).toBe('backlog');
  });

  it('warns when an inactive slot retains more than 1 GB and is critical when a slot is lost', () => {
    const slot = {
      slotName: 's1',
      slotType: 'physical',
      plugin: null,
      active: false,
      activePid: null,
      walBytes: 2 * 1024 ** 3,
      walStatus: 'extended',
      safeWalSizeBytes: null,
      isBlocking: true,
      database: null,
    };
    expect(
      replicationHealthFactors({ ...base, slots: [slot] } as never).find(
        (f) => f.id === 'replication_slots',
      )!.code,
    ).toBe('retaining');
    expect(
      replicationHealthFactors({
        ...base,
        slots: [{ ...slot, walStatus: 'lost' }],
      } as never).find((f) => f.id === 'replication_slots')!.status,
    ).toBe('critical');
  });

  it('warns when a standby WAL receiver is not streaming and skips archiving there', () => {
    const factors = replicationHealthFactors({
      ...base,
      isPrimary: false,
      receiverInfo: {
        status: 'waiting',
        receivedLsn: null,
        latencyMs: null,
        lastMsgReceiptTime: null,
        senderHost: null,
        senderPort: null,
        slotName: null,
      },
      archiver: { ...base.archiver, enabled: false },
    } as never);
    expect(factors.find((f) => f.id === 'standby_replay')!.code).toBe(
      'receiverDown',
    );
    expect(factors.find((f) => f.id === 'wal_archiving')).toBeUndefined();
  });

  it('reports archiving as informational when archive_mode is off on a primary', () => {
    const factors = replicationHealthFactors({
      ...base,
      archiver: { ...base.archiver, enabled: false, mode: 'off' },
    } as never);
    const archiving = factors.find((f) => f.id === 'wal_archiving')!;
    expect(archiving.status).toBe('info');
    expect(archiving.impact).toBe(0);
  });
});

describe('LiveQueryService - getVacuumProgress multixact', () => {
  it('reports multixact age and raises the multixact risk flag', async () => {
    const { service } = await buildService((sql) => {
      if (sql.includes('mxid_age'))
        return [{ db_mxid_age: '120000', max_table_mxid_age: '650000000' }];
      if (sql.includes('age(datfrozenxid)')) return [{ age: '1000' }];
      if (sql.includes('FROM pg_settings'))
        return [
          { name: 'autovacuum', setting: 'on' },
          { name: 'autovacuum_multixact_freeze_max_age', setting: '400000000' },
        ];
      if (sql.includes('count(*)')) return [{ cnt: '0' }];
      return [];
    });

    const report = await service.getVacuumProgress('t1');

    expect(report.databaseMxidAge).toBe(120000);
    expect(report.maxMxidAge).toBe(650000000);
    expect(report.hasMxidRisk).toBe(true);
    expect(report.hasXidRisk).toBe(false);
    expect(report.settings.autovacuumMultixactFreezeMaxAge).toBe(400000000);
  });
});

describe('LiveQueryService - getTableBloat', () => {
  const candidates = [
    {
      relid: '16400',
      schema_name: 'public',
      table_name: 'ledger_entries',
      table_bytes: String(80 * 1024 ** 2),
      n_live_tup: '300000',
      n_dead_tup: '300000',
    },
    {
      relid: '16410',
      schema_name: 'public',
      table_name: 'accounts',
      table_bytes: String(1024 ** 2),
      n_live_tup: '1000',
      n_dead_tup: '0',
    },
  ];

  it('estimates from dead tuples and returns the install command when pgstattuple is missing', async () => {
    const { service } = await buildService((sql) => {
      if (sql.includes("proname = 'pgstattuple_approx'")) return [];
      if (sql.includes('pg_stat_user_tables')) return candidates;
      return [];
    });

    const report = await service.getTableBloat('t1');

    expect(report.method).toBe('dead_tuples');
    expect(report.extensionInstalled).toBe(false);
    expect(report.installCommand).toContain('pgstattuple');
    expect(report.tables[0]).toMatchObject({
      tableName: 'ledger_entries',
      wastedBytes: 40 * 1024 ** 2,
      method: 'dead_tuples',
    });
  });

  it('measures with pgstattuple_approx inside a read-only transaction with a statement timeout', async () => {
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('pgstattuple_approx'))
          return {
            rows: [
              {
                table_len: String(80 * 1024 ** 2),
                scanned_percent: '42.5',
                dead_tuple_len: String(10 * 1024 ** 2),
                dead_tuple_percent: '12.5',
                approx_free_space: String(30 * 1024 ** 2),
                approx_free_percent: '37.5',
              },
            ],
          };
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    const { service } = await buildService((sql) => {
      if (sql.includes("proname = 'pgstattuple_approx'"))
        return [{ schema_name: 'public', can_execute: true }];
      if (sql.includes('pg_stat_user_tables')) return [candidates[0]];
      return [];
    }, client);

    const report = await service.getTableBloat('t1');

    expect(report.method).toBe('pgstattuple_approx');
    expect(client.query.mock.calls[0][0]).toMatch(
      /^BEGIN TRANSACTION READ ONLY; SET LOCAL statement_timeout = '\d+s'$/,
    );
    expect(client.query.mock.calls.some((c) => c[0] === 'ROLLBACK')).toBe(true);
    expect(client.release).toHaveBeenCalled();
    expect(report.tables[0]).toMatchObject({
      wastedBytes: 40 * 1024 ** 2,
      wastedPct: 50,
      freePct: 37.5,
      scannedPct: 42.5,
      method: 'pgstattuple_approx',
    });
  });

  it('suggests granting pg_stat_scan_tables when the function exists but cannot be executed', async () => {
    const { service } = await buildService((sql) => {
      if (sql.includes("proname = 'pgstattuple_approx'"))
        return [{ schema_name: 'public', can_execute: false }];
      if (sql.includes('pg_stat_user_tables')) return candidates;
      return [];
    });

    const report = await service.getTableBloat('t1');

    expect(report.method).toBe('dead_tuples');
    expect(report.grantCommand).toContain('pg_stat_scan_tables');
  });
});
