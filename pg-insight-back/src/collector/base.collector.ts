import { Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { TargetPoolManager } from '../targets/target-pool.manager';

export interface CollectionMeta {
  targetId: string;
  collectedAt: Date;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
}

export interface CollectionResult<T> {
  meta: CollectionMeta;
  data: T | null;
}

export abstract class BaseCollector<TResult> {
  protected abstract readonly logger: Logger;
  protected abstract readonly name: string;

  constructor(protected readonly poolManager: TargetPoolManager) {}

  async run(targetId: string): Promise<CollectionResult<TResult>> {
    const start = Date.now();

    try {
      const pool = this.poolManager.getPool(targetId);
      if (!pool) {
        throw new Error(`No active pool for target: ${targetId}`);
      }

      const data = await this.collect(pool, targetId);
      const durationMs = Date.now() - start;

      return {
        meta: {
          targetId,
          collectedAt: new Date(),
          durationMs,
          success: true,
        },
        data,
      };
    } catch (error) {
      const durationMs = Date.now() - start;
      const errorMessage = (error as Error).message;

      this.logger.error(
        `[${this.name}] Collection failed for target ${targetId.slice(0, 8)}: ${errorMessage}`,
      );

      return {
        meta: {
          targetId,
          collectedAt: new Date(),
          durationMs,
          success: false,
          errorMessage,
        },
        data: null,
      };
    }
  }

  protected abstract collect(pool: Pool, targetId: string): Promise<TResult>;

  protected async extensionExists(
    pool: Pool,
    extname: string,
  ): Promise<boolean> {
    const result = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM pg_extension WHERE extname = $1
       ) AS exists`,
      [extname],
    );
    return result.rows[0].exists;
  }

  protected async getSetting(pool: Pool, name: string): Promise<string> {
    const result = await pool.query<{ setting: string }>(
      `SELECT setting FROM pg_settings WHERE name = $1`,
      [name],
    );
    return result.rows[0]?.setting ?? '';
  }
}
