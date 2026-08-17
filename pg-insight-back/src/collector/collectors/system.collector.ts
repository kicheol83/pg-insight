import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { BaseCollector } from '../base.collector';
import { TargetPoolManager } from '../../targets/target-pool.manager';

export interface PgSetting {
  name: string;
  setting: string;
  unit: string | null;
  category: string;
  shortDesc: string;
  context: string;
  vartype: string;
  source: string;
  minVal: string | null;
  maxVal: string | null;
  enumVals: string[] | null;
  isPendingRestart: boolean;
}

export interface ExtensionInfo {
  name: string;
  version: string;
  schemaName: string;
  comment: string | null;
  isRelocatable: boolean;
}

export interface DatabaseInfo {
  oid: number;
  name: string;
  owner: string;
  encoding: string;
  lcCollate: string;
  lcCtype: string;
  isTemplate: boolean;
  allowConnect: boolean;
  sizeBytes: number;
  sizeHuman: string;
  ageXid: number;
  connections: number;
}

export interface RoleInfo {
  oid: number;
  name: string;
  isSuperuser: boolean;
  canLogin: boolean;
  canCreateDb: boolean;
  canCreateRole: boolean;
  replication: boolean;
  connectionLimit: number;
  validUntil: Date | null;
  memberOf: string[];
}

export interface ServerInfo {
  version: string;
  versionNum: number;
  majorVersion: number;
  dataDirectory: string;
  configFile: string;
  hbaFile: string;
  timezone: string;
  serverEncoding: string;
  maxConnections: number;
  superuserReservedConnections: number;
  postmasterStartTime: Date | null;
  uptimeHours: number;
}

export interface SystemSnapshot {
  server: ServerInfo;
  databases: DatabaseInfo[];
  extensions: ExtensionInfo[];
  roles: RoleInfo[];

  keySettings: Record<string, string>;
  allSettings: PgSetting[];

  totalDatabaseSize: number; // bytes
  databaseCount: number;
  extensionCount: number;
  superuserCount: number;

  configIssues: Array<{
    setting: string;
    current: string;
    recommended: string;
    reason: string;
    severity: 'info' | 'warning';
  }>;
}

@Injectable()
export class SystemCollector extends BaseCollector<SystemSnapshot> {
  protected readonly logger = new Logger(SystemCollector.name);
  protected readonly name = 'SystemCollector';

  constructor(poolManager: TargetPoolManager) {
    super(poolManager);
  }

  protected async collect(
    pool: Pool,
    _targetId: string,
  ): Promise<SystemSnapshot> {
    const [server, databases, extensions, roles, settings] = await Promise.all([
      this.getServerInfo(pool),
      this.getDatabaseInfo(pool),
      this.getExtensions(pool),
      this.getRoles(pool),
      this.getSettings(pool),
    ]);

    const keySettings = this.extractKeySettings(settings);
    const configIssues = this.analyzeConfig(settings, server);
    const totalDatabaseSize = databases.reduce((s, d) => s + d.sizeBytes, 0);

    return {
      server,
      databases,
      extensions,
      roles,
      keySettings,
      allSettings: settings,
      totalDatabaseSize,
      databaseCount: databases.filter((d) => !d.isTemplate).length,
      extensionCount: extensions.length,
      superuserCount: roles.filter((r) => r.isSuperuser && r.canLogin).length,
      configIssues,
    };
  }

  private async getServerInfo(pool: Pool): Promise<ServerInfo> {
    const result = await pool.query<{
      version: string;
      version_num: string;
      data_dir: string;
      config_file: string;
      hba_file: string;
      timezone: string;
      server_encoding: string;
      max_connections: string;
      superuser_reserved_connections: string;
      postmaster_start_time: Date | null;
    }>(`
      SELECT
        version()                                              AS version,
        current_setting('server_version_num')                  AS version_num,
        current_setting('data_directory')                      AS data_dir,
        current_setting('config_file')                         AS config_file,
        current_setting('hba_file')                            AS hba_file,
        current_setting('TimeZone')                            AS timezone,
        current_setting('server_encoding')                     AS server_encoding,
        current_setting('max_connections')                     AS max_connections,
        current_setting('superuser_reserved_connections')      AS superuser_reserved_connections,
        pg_postmaster_start_time()                             AS postmaster_start_time
    `);

    const row = result.rows[0];
    const versionNum = parseInt(row.version_num, 10);
    const majorVersion = Math.floor(versionNum / 10000);

    const uptimeMs = row.postmaster_start_time
      ? Date.now() - row.postmaster_start_time.getTime()
      : 0;

    return {
      version: row.version,
      versionNum,
      majorVersion,
      dataDirectory: row.data_dir,
      configFile: row.config_file,
      hbaFile: row.hba_file,
      timezone: row.timezone,
      serverEncoding: row.server_encoding,
      maxConnections: parseInt(row.max_connections, 10),
      superuserReservedConnections: parseInt(
        row.superuser_reserved_connections,
        10,
      ),
      postmasterStartTime: row.postmaster_start_time,
      uptimeHours: Math.round(uptimeMs / 3_600_000),
    };
  }

  private async getDatabaseInfo(pool: Pool): Promise<DatabaseInfo[]> {
    const result = await pool.query<{
      oid: number;
      datname: string;
      owner: string;
      encoding: string;
      datcollate: string;
      datctype: string;
      datistemplate: boolean;
      datallowconn: boolean;
      size_bytes: string;
      age: string;
      connections: string;
    }>(`
      SELECT
        d.oid,
        d.datname,
        r.rolname                        AS owner,
        pg_encoding_to_char(d.encoding)  AS encoding,
        d.datcollate,
        d.datctype,
        d.datistemplate,
        d.datallowconn,
        -- Saize — NULL bo'lishi mumkin (template0 ga ulana olmasa)
        COALESCE(pg_database_size(d.oid), 0) AS size_bytes,
        age(d.datfrozenxid)              AS age,
        COALESCE(
          (SELECT COUNT(*) FROM pg_stat_activity
           WHERE datid = d.oid AND pid <> pg_backend_pid()),
          0
        )                                AS connections
      FROM pg_database d
      JOIN pg_roles r ON r.oid = d.datdba
      ORDER BY size_bytes DESC
    `);

    return result.rows.map((row) => {
      const sizeBytes = parseInt(row.size_bytes, 10);
      return {
        oid: row.oid,
        name: row.datname,
        owner: row.owner,
        encoding: row.encoding,
        lcCollate: row.datcollate,
        lcCtype: row.datctype,
        isTemplate: row.datistemplate,
        allowConnect: row.datallowconn,
        sizeBytes,
        sizeHuman: this.formatBytes(sizeBytes),
        ageXid: parseInt(row.age, 10),
        connections: parseInt(row.connections, 10),
      };
    });
  }

  private async getExtensions(pool: Pool): Promise<ExtensionInfo[]> {
    const result = await pool.query<{
      extname: string;
      extversion: string;
      nspname: string;
      comment: string | null;
      extrelocatable: boolean;
    }>(`
      SELECT
        e.extname,
        e.extversion,
        n.nspname,
        obj_description(e.oid, 'pg_extension') AS comment,
        e.extrelocatable
      FROM pg_extension e
      JOIN pg_namespace n ON n.oid = e.extnamespace
      ORDER BY e.extname
    `);

    return result.rows.map((row) => ({
      name: row.extname,
      version: row.extversion,
      schemaName: row.nspname,
      comment: row.comment,
      isRelocatable: row.extrelocatable,
    }));
  }

  private async getRoles(pool: Pool): Promise<RoleInfo[]> {
    const result = await pool.query<{
      oid: number;
      rolname: string;
      rolsuper: boolean;
      rolinherit: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
      rolcanlogin: boolean;
      rolreplication: boolean;
      rolconnlimit: number;
      rolvaliduntil: Date | null;
      member_of: string | null;
    }>(`
      SELECT
        r.oid,
        r.rolname,
        r.rolsuper,
        r.rolinherit,
        r.rolcreaterole,
        r.rolcreatedb,
        r.rolcanlogin,
        r.rolreplication,
        r.rolconnlimit,
        r.rolvaliduntil,
        -- Qaysi rolle'larga member (STRING_AGG)
        NULLIF(
          STRING_AGG(mr.rolname, ', ' ORDER BY mr.rolname),
          ''
        ) AS member_of
      FROM pg_roles r
      LEFT JOIN pg_auth_members m ON m.member = r.oid
      LEFT JOIN pg_roles mr ON mr.oid = m.roleid
      GROUP BY r.oid, r.rolname, r.rolsuper, r.rolinherit,
               r.rolcreaterole, r.rolcreatedb, r.rolcanlogin,
               r.rolreplication, r.rolconnlimit, r.rolvaliduntil
      ORDER BY r.rolsuper DESC, r.rolcanlogin DESC, r.rolname
    `);

    return result.rows.map((row) => ({
      oid: row.oid,
      name: row.rolname,
      isSuperuser: row.rolsuper,
      canLogin: row.rolcanlogin,
      canCreateDb: row.rolcreatedb,
      canCreateRole: row.rolcreaterole,
      replication: row.rolreplication,
      connectionLimit: row.rolconnlimit,
      validUntil: row.rolvaliduntil,
      memberOf: row.member_of ? row.member_of.split(', ') : [],
    }));
  }

  private async getSettings(pool: Pool): Promise<PgSetting[]> {
    const result = await pool.query<{
      name: string;
      setting: string;
      unit: string | null;
      category: string;
      short_desc: string;
      context: string;
      vartype: string;
      source: string;
      min_val: string | null;
      max_val: string | null;
      enumvals: string[] | null;
      pending_restart: boolean;
    }>(`
      SELECT
        name, setting, unit, category, short_desc, context,
        vartype, source, min_val, max_val, enumvals, pending_restart
      FROM pg_settings
      ORDER BY category, name
    `);

    return result.rows.map((row) => ({
      name: row.name,
      setting: row.setting,
      unit: row.unit,
      category: row.category,
      shortDesc: row.short_desc,
      context: row.context,
      vartype: row.vartype,
      source: row.source,
      minVal: row.min_val,
      maxVal: row.max_val,
      enumVals: row.enumvals,
      isPendingRestart: row.pending_restart,
    }));
  }

  private extractKeySettings(settings: PgSetting[]): Record<string, string> {
    const keys = [
      'max_connections',
      'shared_buffers',
      'work_mem',
      'maintenance_work_mem',
      'effective_cache_size',
      'wal_level',
      'max_wal_senders',
      'max_replication_slots',
      'log_min_duration_statement',
      'autovacuum',
      'autovacuum_max_workers',
      'checkpoint_timeout',
      'checkpoint_completion_target',
      'synchronous_commit',
      'fsync',
      'full_page_writes',
      'track_activities',
      'track_counts',
      'track_functions',
    ];

    const map = new Map(settings.map((s) => [s.name, s.setting]));
    return Object.fromEntries(keys.map((k) => [k, map.get(k) ?? 'unknown']));
  }

  private analyzeConfig(
    settings: PgSetting[],
    server: ServerInfo,
  ): SystemSnapshot['configIssues'] {
    const issues: SystemSnapshot['configIssues'] = [];
    const map = new Map(settings.map((s) => [s.name, s.setting]));

    const get = (k: string) => map.get(k) ?? '';

    const sharedPreload = get('shared_preload_libraries');
    if (!sharedPreload.includes('pg_stat_statements')) {
      issues.push({
        setting: 'shared_preload_libraries',
        current: sharedPreload,
        recommended: 'pg_stat_statements',
        reason: 'pg_stat_statements enables query performance monitoring',
        severity: 'warning',
      });
    }

    if (get('track_activities') === 'off') {
      issues.push({
        setting: 'track_activities',
        current: 'off',
        recommended: 'on',
        reason: 'Disabling track_activities prevents session monitoring',
        severity: 'warning',
      });
    }

    if (get('synchronous_commit') === 'off') {
      issues.push({
        setting: 'synchronous_commit',
        current: 'off',
        recommended: 'on',
        reason:
          'synchronous_commit=off risks losing last few transactions on crash',
        severity: 'info',
      });
    }

    if (get('fsync') === 'off') {
      issues.push({
        setting: 'fsync',
        current: 'off',
        recommended: 'on',
        reason: 'fsync=off risks CATASTROPHIC data corruption on system crash!',
        severity: 'warning',
      });
    }

    const logDuration = parseInt(get('log_min_duration_statement') || '-1', 10);
    if (logDuration < 0) {
      issues.push({
        setting: 'log_min_duration_statement',
        current: '-1 (disabled)',
        recommended: '1000',
        reason: 'Set to log queries slower than 1s for performance monitoring',
        severity: 'info',
      });
    }

    if (server.majorVersion < 13) {
      issues.push({
        setting: 'server_version',
        current: String(server.majorVersion),
        recommended: '16+',
        reason: `PostgreSQL ${server.majorVersion} is old. Consider upgrading for security and performance.`,
        severity: 'warning',
      });
    }

    return issues;
  }
  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  }
}
