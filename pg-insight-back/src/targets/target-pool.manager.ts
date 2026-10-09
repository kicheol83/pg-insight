import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Pool, PoolClient, PoolConfig } from 'pg';
import { PrismaService } from '../database/prisma.service';
import { decrypt, getEncryptionKey } from '../common/crypto.util';
import { TargetHostPolicy, withServername } from './target-host.policy';

export interface TargetPoolEntry {
  pool: Pool;
  targetId: string;
  host: string;
  port: number;
  database: string;
  username: string;
  status: 'connecting' | 'active' | 'error';
  pgVersion?: string;
  pgVersionNum?: number;
  hasStatStatements: boolean;
  errorMessage?: string;
  connectedAt?: Date;
}

interface StoredTarget {
  id: string;
  host: string;
  port: number;
  database: string;
  username: string;
  passwordEncrypted: string;
  sslMode: string;
  isActive: boolean;
}

const STORED_TARGET_SELECT = {
  id: true,
  host: true,
  port: true,
  database: true,
  username: true,
  passwordEncrypted: true,
  sslMode: true,
  isActive: true,
};

@Injectable()
export class TargetPoolManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TargetPoolManager.name);

  private readonly pools = new Map<string, TargetPoolEntry>();

  private readonly creating = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly hostPolicy: TargetHostPolicy,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('🔌 TargetPoolManager initializing...');

    const targets = await this.targetDelegate().findMany({
      where: { isActive: true },
      select: STORED_TARGET_SELECT,
    });

    this.logger.log(`Found ${targets.length} active target(s)`);

    await Promise.allSettled(
      targets.map((t) =>
        this.connectStored(t).catch((error: Error) => {
          this.logger.error(
            `Failed to start target ${t.id.slice(0, 8)}: ${error.message}`,
          );
        }),
      ),
    );

    this.logger.log(`${this.pools.size}/${targets.length} target(s) connected`);
  }

  async reconnect(targetId: string): Promise<TargetPoolEntry> {
    const target = await this.targetDelegate().findUnique({
      where: { id: targetId },
      select: STORED_TARGET_SELECT,
    });
    if (!target) {
      throw new Error(`Target ${targetId} not found`);
    }
    return this.connectStored(target);
  }

  async pausedTargetIds(): Promise<string[]> {
    const rows = await this.targetDelegate().findMany({
      where: { isActive: true, status: 'paused' },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  private async connectStored(target: StoredTarget): Promise<TargetPoolEntry> {
    const password = decrypt(target.passwordEncrypted, getEncryptionKey());
    return this.createPool(target.id, {
      host: target.host,
      port: target.port,
      database: target.database,
      user: target.username,
      password,
      ssl: this.buildSslConfig(target.sslMode),
    });
  }

  private async isTrusted(targetId: string): Promise<boolean> {
    const db = this.prisma as unknown as Record<
      string,
      {
        findUnique: (
          args: unknown,
        ) => Promise<{ createdByUser: { role: string } | null } | null>;
      }
    >;
    const target = await db['target'].findUnique({
      where: { id: targetId },
      select: { createdByUser: { select: { role: true } } },
    });
    return target?.createdByUser?.role === 'admin';
  }

  private targetDelegate(): {
    findMany: (args: unknown) => Promise<StoredTarget[]>;
    findUnique: (args: unknown) => Promise<StoredTarget | null>;
  } {
    const db = this.prisma as unknown as Record<string, unknown>;
    return db['target'] as {
      findMany: (args: unknown) => Promise<StoredTarget[]>;
      findUnique: (args: unknown) => Promise<StoredTarget | null>;
    };
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('🔌 Draining all connection pools...');

    await Promise.allSettled(
      Array.from(this.pools.values()).map((entry) =>
        entry.pool.end().then(() => {
          this.logger.debug(`Pool drained: ${entry.targetId}`);
        }),
      ),
    );

    this.pools.clear();
    this.logger.log('All pools drained');
  }

  async createPool(
    targetId: string,
    config: PoolConfig & { password: string },
  ): Promise<TargetPoolEntry> {
    if (this.creating.has(targetId)) {
      this.logger.warn(`Pool for ${targetId} is already being created`);
      const existing = this.pools.get(targetId);
      if (existing) return existing;
      await new Promise((r) => setTimeout(r, 2000));
      return this.pools.get(targetId) ?? this.createPool(targetId, config);
    }

    if (this.pools.has(targetId)) {
      await this.removePool(targetId);
    }

    this.creating.add(targetId);

    const entry: TargetPoolEntry = {
      pool: null as unknown as Pool,
      targetId,
      host: config.host as string,
      port: config.port as number,
      database: config.database as string,
      username: config.user as string,
      status: 'connecting',
      hasStatStatements: false,
    };

    try {
      const resolved = await this.hostPolicy.resolve(
        String(config.host),
        await this.isTrusted(targetId),
      );
      const pool = new Pool({
        ...config,
        host: resolved.address,
        ssl: withServername(config.ssl, resolved.servername),
        min: 1,
        max: 5,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
        application_name: `pg-insight[${targetId.slice(0, 8)}]`,
      });

      pool.on('error', (err) => {
        this.logger.error(`Pool error [target:${targetId}]: ${err.message}`);
        const e = this.pools.get(targetId);
        if (e) {
          e.status = 'error';
          e.errorMessage = err.message;
        }
      });

      entry.pool = pool;

      const client = await pool.connect();

      try {
        const versionResult = await client.query<{
          version: string;
          version_num: string;
        }>(`
          SELECT
            split_part(version(), ' ', 2)  AS version,
            current_setting('server_version_num') AS version_num
        `);

        const { version, version_num } = versionResult.rows[0];
        entry.pgVersion = version;
        entry.pgVersionNum = parseInt(version_num, 10);

        const ssResult = await client.query<{ exists: boolean }>(`
          SELECT EXISTS(
            SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
          ) AS exists
        `);
        entry.hasStatStatements = ssResult.rows[0].exists;

        entry.status = 'active';
        entry.connectedAt = new Date();

        this.logger.log(
          `Connected to target [${targetId.slice(0, 8)}] ` +
            `${config.host}:${config.port}/${config.database} ` +
            `(PG ${version}, pg_stat_statements: ${entry.hasStatStatements})`,
        );

        await this.updateTargetStatus(targetId, 'active', {
          pgVersion: version,
          pgVersionNum: parseInt(version_num, 10),
          hasStatStatements: entry.hasStatStatements,
        });
      } finally {
        client.release();
      }

      this.pools.set(targetId, entry);
      return entry;
    } catch (error) {
      const msg = (error as Error).message;
      this.logger.error(
        `Failed to connect target [${targetId.slice(0, 8)}]: ${msg}`,
      );

      entry.status = 'error';
      entry.errorMessage = msg;

      if (entry.pool) this.pools.set(targetId, entry);

      await this.updateTargetStatus(targetId, 'error', {}, msg);

      throw error;
    } finally {
      this.creating.delete(targetId);
    }
  }

  getPool(targetId: string): Pool | null {
    return this.pools.get(targetId)?.pool ?? null;
  }

  getEntry(targetId: string): TargetPoolEntry | null {
    return this.pools.get(targetId) ?? null;
  }

  getAllEntries(): TargetPoolEntry[] {
    return Array.from(this.pools.values());
  }

  async removePool(targetId: string): Promise<void> {
    const entry = this.pools.get(targetId);
    if (!entry) return;

    try {
      await entry.pool.end();
      this.logger.log(`Pool removed: ${targetId}`);
    } catch (error) {
      this.logger.error(
        `Error draining pool ${targetId}:`,
        (error as Error).message,
      );
    } finally {
      this.pools.delete(targetId);
    }
  }

  getPoolStats(targetId: string): {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  } | null {
    const entry = this.pools.get(targetId);
    if (!entry) return null;

    return {
      totalCount: entry.pool.totalCount,
      idleCount: entry.pool.idleCount,
      waitingCount: entry.pool.waitingCount,
    };
  }

  async query<T extends Record<string, unknown>>(
    targetId: string,
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const pool = this.getPool(targetId);
    if (!pool) throw new Error(`No pool found for target: ${targetId}`);

    const result = await pool.query<T>(sql, params);
    return result.rows;
  }

  async withClient<T>(
    targetId: string,
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const pool = this.getPool(targetId);
    if (!pool) throw new Error(`No pool found for target: ${targetId}`);

    const client = await pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  private buildSslConfig(
    sslMode: string,
  ): false | { rejectUnauthorized: boolean } | undefined {
    switch (sslMode) {
      case 'disable':
        return false;
      case 'require':
        return { rejectUnauthorized: false };
      case 'verify-ca':
      case 'verify-full':
        return { rejectUnauthorized: true };
      default:
        return undefined;
    }
  }

  private async updateTargetStatus(
    targetId: string,
    status: string,
    extra: Record<string, unknown> = {},
    errorMessage?: string,
  ): Promise<void> {
    try {
      const db = this.prisma as unknown as Record<string, unknown>;
      const target = db['target'] as {
        update: (args: unknown) => Promise<unknown>;
        updateMany: (args: unknown) => Promise<unknown>;
      };
      await target.update({
        where: { id: targetId },
        data: {
          errorMessage: errorMessage ?? null,
          lastConnectedAt: status === 'active' ? new Date() : undefined,
          ...extra,
        },
      });
      await target.updateMany({
        where: { id: targetId, status: { not: 'paused' } },
        data: { status },
      });
    } catch (error) {
      this.logger.error(
        'Failed to update target status:',
        (error as Error).message,
      );
    }
  }
}
