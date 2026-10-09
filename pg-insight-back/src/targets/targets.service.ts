import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';
import { encrypt, decrypt, getEncryptionKey } from '../common/crypto.util';
import { PrismaService } from '../database/prisma.service';
import { TargetPoolManager } from './target-pool.manager';
import { TargetHostPolicy, withServername } from './target-host.policy';
import { CollectorOrchestrator } from '../collector/collector.orchestrator';

export interface CreateTargetDto {
  name: string;
  host: string;
  port?: number;
  database: string;
  username: string;
  password: string;
  sslMode?:
    'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';
  sslCert?: string;
}

export interface UpdateTargetDto {
  name?: string;
  password?: string;
  sslMode?: string;
  sslCert?: string;
  collectionIntervalMs?: number;
  slowQueryThresholdMs?: number;
}

export interface ConnectionTestResult {
  success: boolean;
  pgVersion?: string;
  pgVersionNum?: number;
  hasStatStatements: boolean;
  hasTimescaledb: boolean;
  latencyMs: number;
  errorMessage?: string;
}

export interface TargetStatus {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  status: string;
  pgVersion?: string;
  hasStatStatements: boolean;
  poolTotal: number;
  poolIdle: number;
  poolWaiting: number;
  lastCollectedAt?: Date;
  errorMessage?: string;
  isCollecting: boolean;
  uptime?: number;
}

@Injectable()
export class TargetsService {
  private readonly logger = new Logger(TargetsService.name);

  private readonly encryptionKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly poolManager: TargetPoolManager,
    private readonly orchestrator: CollectorOrchestrator,
    private readonly hostPolicy: TargetHostPolicy,
    private readonly config: ConfigService,
  ) {
    this.encryptionKey = getEncryptionKey();

    if (this.encryptionKey === 'default-dev-key-change-in-production') {
      this.logger.warn(
        '⚠️  Using default encryption key! Set ENCRYPTION_KEY env variable in production.',
      );
    }
  }

  async findAll(
    actorUserId?: string,
    actorRole?: string,
  ): Promise<TargetStatus[]> {
    const db = this.prisma as unknown as Record<string, unknown>;
    const isAdmin = actorRole === 'admin' || !actorUserId;
    const targets = await (
      db['target'] as {
        findMany: (args: unknown) => Promise<
          Array<{
            id: string;
            name: string;
            host: string;
            port: number;
            database: string;
            status: string;
            pgVersion: string | null;
            hasStatStatements: boolean;
            lastCollectedAt: Date | null;
            errorMessage: string | null;
          }>
        >;
      }
    ).findMany({
      where: {
        isActive: true,
        ...(isAdmin ? {} : { createdByUserId: actorUserId }),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        host: true,
        port: true,
        database: true,
        status: true,
        pgVersion: true,
        hasStatStatements: true,
        lastCollectedAt: true,
        errorMessage: true,
      },
    });

    return targets.map((t) => {
      const poolStats = this.poolManager.getPoolStats(t.id);
      return {
        id: t.id,
        name: t.name,
        host: t.host,
        port: t.port,
        database: t.database,
        status: t.status,
        pgVersion: t.pgVersion ?? undefined,
        hasStatStatements: t.hasStatStatements,
        poolTotal: poolStats?.totalCount ?? 0,
        poolIdle: poolStats?.idleCount ?? 0,
        poolWaiting: poolStats?.waitingCount ?? 0,
        lastCollectedAt: t.lastCollectedAt ?? undefined,
        errorMessage: t.errorMessage ?? undefined,
        isCollecting: this.orchestrator.getActiveTargets().includes(t.id),
      };
    });
  }

  async findOne(
    id: string,
    actorUserId?: string,
    actorRole?: string,
  ): Promise<TargetStatus> {
    const targets = await this.findAll(actorUserId, actorRole);
    const target = targets.find((t) => t.id === id);
    if (!target) throw new NotFoundException(`Target ${id} not found`);
    return target;
  }

  async create(
    dto: CreateTargetDto,
    actor: { id: string; role: string },
  ): Promise<TargetStatus> {
    const trusted = actor.role === 'admin';
    const createdByUserId = actor.id;

    if (!trusted) {
      await this.assertWithinQuota(actor.id);
    }

    // 1. Connection test avval
    const testResult = await this.testConnection(dto, trusted);
    if (!testResult.success) {
      throw new BadRequestException(
        `Cannot connect to PostgreSQL: ${testResult.errorMessage}`,
      );
    }

    // 2. Duplicate check
    const db = this.prisma as unknown as Record<string, unknown>;
    const existing = await (
      db['target'] as {
        findFirst: (args: unknown) => Promise<{ id: string } | null>;
      }
    ).findFirst({
      where: {
        host: dto.host,
        port: dto.port ?? 5432,
        database: dto.database,
        username: dto.username,
        isActive: true,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Target already exists: ${dto.host}:${dto.port ?? 5432}/${dto.database}`,
      );
    }

    const passwordEncrypted = encrypt(dto.password, this.encryptionKey);

    const target = await (
      db['target'] as {
        create: (args: unknown) => Promise<{ id: string; name: string }>;
      }
    ).create({
      data: {
        name: dto.name,
        host: dto.host,
        port: dto.port ?? 5432,
        database: dto.database,
        username: dto.username,
        passwordEncrypted,
        sslMode: dto.sslMode ?? 'prefer',
        sslCert: dto.sslCert,
        pgVersion: testResult.pgVersion,
        pgVersionNum: testResult.pgVersionNum,
        hasStatStatements: testResult.hasStatStatements,
        hasTimescaledb: testResult.hasTimescaledb,
        status: 'connecting',
        createdByUserId,
      },
    });

    this.logger.log(
      `Target created: ${dto.name} (${dto.host}:${dto.port ?? 5432}/${dto.database})`,
    );

    await this.poolManager.createPool(target.id, {
      host: dto.host,
      port: dto.port ?? 5432,
      database: dto.database,
      user: dto.username,
      password: dto.password,
      ssl: this.buildSslConfig(dto.sslMode),
    });

    await this.orchestrator.startCollection(target.id);

    return this.findOne(target.id);
  }

  async update(id: string, dto: UpdateTargetDto): Promise<TargetStatus> {
    const before = await this.findOne(id);

    const updateData: Record<string, unknown> = {};

    if (dto.name) updateData['name'] = dto.name;
    if (dto.sslMode) updateData['sslMode'] = dto.sslMode;
    if (dto.sslCert) updateData['sslCert'] = dto.sslCert;
    if (dto.collectionIntervalMs)
      updateData['collectionIntervalMs'] = dto.collectionIntervalMs;
    if (dto.slowQueryThresholdMs)
      updateData['slowQueryThresholdMs'] = dto.slowQueryThresholdMs;

    if (dto.password) {
      updateData['passwordEncrypted'] = encrypt(
        dto.password,
        this.encryptionKey,
      );
    }

    const db = this.prisma as unknown as Record<string, unknown>;
    await (
      db['target'] as {
        update: (args: unknown) => Promise<unknown>;
      }
    ).update({ where: { id }, data: updateData });

    if (dto.password || dto.sslMode) {
      this.orchestrator.stopCollection(id);
      await this.poolManager.reconnect(id);
      if (before.status !== 'paused') {
        await this.orchestrator.startCollection(id);
      }
    }

    return this.findOne(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findOne(id);

    this.orchestrator.stopCollection(id);

    await this.poolManager.removePool(id);

    const db = this.prisma as unknown as Record<string, unknown>;
    await (
      db['target'] as {
        update: (args: unknown) => Promise<unknown>;
      }
    ).update({
      where: { id },
      data: { isActive: false, status: 'paused' },
    });

    this.logger.log(`🗑  Target removed: ${id.slice(0, 8)}`);
    return { message: `Target ${id} removed` };
  }

  async testConnection(
    dto: {
      host: string;
      port?: number;
      database: string;
      username: string;
      password: string;
      sslMode?: string;
    },
    trusted = false,
  ): Promise<ConnectionTestResult> {
    const resolved = await this.hostPolicy.resolve(dto.host, trusted);
    const startTime = Date.now();

    const testPool = new Pool({
      host: resolved.address,
      port: dto.port ?? 5432,
      database: dto.database,
      user: dto.username,
      password: dto.password,
      max: 1,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 1_000,
      ssl: withServername(
        this.buildSslConfig(dto.sslMode),
        resolved.servername,
      ),
      application_name: 'pg-insight-test',
    });

    let client: PoolClient;
    try {
      client = await testPool.connect();

      const [versionResult, extResult] = await Promise.all([
        client.query<{ version: string; version_num: string }>(`
          SELECT
            split_part(version(), ' ', 2)               AS version,
            current_setting('server_version_num')        AS version_num
        `),
        client.query<{ extname: string }>(`
          SELECT extname FROM pg_extension
          WHERE extname IN ('pg_stat_statements', 'timescaledb')
        `),
      ]);

      const extensions = extResult.rows.map((r) => r.extname);
      const latencyMs = Date.now() - startTime;

      return {
        success: true,
        pgVersion: versionResult.rows[0].version,
        pgVersionNum: parseInt(versionResult.rows[0].version_num, 10),
        hasStatStatements: extensions.includes('pg_stat_statements'),
        hasTimescaledb: extensions.includes('timescaledb'),
        latencyMs,
      };
    } catch (error) {
      return {
        success: false,
        hasStatStatements: false,
        hasTimescaledb: false,
        latencyMs: Date.now() - startTime,
        errorMessage: (error as Error).message,
      };
    } finally {
      client?.release();
      await testPool.end().catch(() => {});
    }
  }

  private async assertWithinQuota(userId: string): Promise<void> {
    const quota = Number(this.config.get('TARGET_QUOTA_PER_USER') ?? 3);
    const db = this.prisma as unknown as Record<
      string,
      { count: (args: unknown) => Promise<number> }
    >;
    const owned = await db['target'].count({
      where: { createdByUserId: userId, isActive: true },
    });
    if (owned >= quota) {
      throw new ForbiddenException(
        `Target limit reached: ${quota} active targets per account`,
      );
    }
  }

  async triggerRefresh(id: string): Promise<{ message: string }> {
    await this.findOne(id);
    await this.orchestrator.refreshTarget(id);
    return { message: 'Refresh triggered' };
  }

  async pause(id: string): Promise<TargetStatus> {
    await this.findOne(id);
    this.orchestrator.stopCollection(id);

    const db = this.prisma as unknown as Record<string, unknown>;
    await (
      db['target'] as {
        update: (args: unknown) => Promise<unknown>;
      }
    ).update({ where: { id }, data: { status: 'paused' } });

    return this.findOne(id);
  }

  async resume(id: string): Promise<TargetStatus> {
    await this.findOne(id);
    await this.orchestrator.startCollection(id);

    const db = this.prisma as unknown as Record<string, unknown>;
    await (
      db['target'] as {
        update: (args: unknown) => Promise<unknown>;
      }
    ).update({ where: { id }, data: { status: 'active' } });

    return this.findOne(id);
  }

  private buildSslConfig(
    sslMode?: string,
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

  decryptPassword(encrypted: string): string {
    return decrypt(encrypted, this.encryptionKey);
  }
}
