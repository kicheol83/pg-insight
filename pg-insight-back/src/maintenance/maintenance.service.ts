import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TargetPoolManager } from '../targets/target-pool.manager';
import { AuditService } from '../audit/audit.service';
import { quoteQualifiedIdent } from '../common/sql-ident.util';

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly poolManager: TargetPoolManager,
    private readonly audit: AuditService,
  ) {}

  // ── VACUUM (ANALYZE) bitta jadvalga ────────────────────────────
  async vacuumTable(
    targetId: string,
    schema: string,
    table: string,
    userId: string,
    userEmail: string,
  ): Promise<{ started: true; target: string }> {
    await this.assertRelationExists(targetId, schema, table, 'r'); 

    const ident = quoteQualifiedIdent(schema, table);
    const sql = `VACUUM (ANALYZE) ${ident}`;

    await this.audit.record({
      action: 'maintenance.vacuum.start',
      userId,
      userEmail,
      targetId,
      detail: `${schema}.${table}`,
    });

    this.runInBackground(targetId, sql, async (success, error) => {
      await this.audit.record({
        action: success
          ? 'maintenance.vacuum.complete'
          : 'maintenance.vacuum.failed',
        userId,
        userEmail,
        targetId,
        detail: success ? `${schema}.${table}` : `${schema}.${table}: ${error}`,
      });
    });

    return { started: true, target: `${schema}.${table}` };
  }

  // ── DROP INDEX CONCURRENTLY — faqat ishlatilmayotgan indekslar ──
  async dropUnusedIndex(
    targetId: string,
    schema: string,
    index: string,
    userId: string,
    userEmail: string,
  ): Promise<{ started: true; index: string }> {
    await this.assertRelationExists(targetId, schema, index, 'i'); // 'i' = indeks

    // Server tomonida QAYTA tekshiruv — client'dan kelgan "unused"
    // degan ma'lumot eskirgan bo'lishi mumkin. Bu indeks haqiqatan
    // hozir ham ishlatilmayotganini o'zimiz tasdiqlaymiz.
    const usageRows = await this.poolManager.query<{ idx_scan: string }>(
      targetId,
      `
      SELECT idx_scan FROM pg_stat_user_indexes
      WHERE schemaname = $1 AND indexrelname = $2
    `,
      [schema, index],
    );
    const idxScan = Number(usageRows[0]?.idx_scan) || 0;
    if (idxScan > 0) {
      throw new BadRequestException(
        `Index ${schema}.${index} is now being used (${idxScan} scans) — refusing to drop. Refresh the Tables page to see current data.`,
      );
    }

    // Primary key yoki unique constraint'ga tegishli indeksni
    // o'chirishga yo'l qo'ymaymiz — bu odatda ma'lumot yaxlitligini
    // ta'minlaydi va tasodifan o'chirilishi og'ir oqibatlarga olib kelishi mumkin
    const constraintRows = await this.poolManager.query<{ exists: boolean }>(
      targetId,
      `
      SELECT EXISTS(
        SELECT 1 FROM pg_constraint c
        JOIN pg_class i ON i.oid = c.conindid
        JOIN pg_namespace n ON n.oid = i.relnamespace
        WHERE n.nspname = $1 AND i.relname = $2
      ) AS exists
    `,
      [schema, index],
    );
    if (constraintRows[0]?.exists) {
      throw new BadRequestException(
        `Index ${schema}.${index} backs a constraint (primary key or unique) — cannot be dropped directly.`,
      );
    }

    const ident = quoteQualifiedIdent(schema, index);
    const sql = `DROP INDEX CONCURRENTLY ${ident}`;

    await this.audit.record({
      action: 'maintenance.drop_index.start',
      userId,
      userEmail,
      targetId,
      detail: `${schema}.${index}`,
    });

    this.runInBackground(targetId, sql, async (success, error) => {
      await this.audit.record({
        action: success
          ? 'maintenance.drop_index.complete'
          : 'maintenance.drop_index.failed',
        userId,
        userEmail,
        targetId,
        detail: success ? `${schema}.${index}` : `${schema}.${index}: ${error}`,
      });
    });

    return { started: true, index: `${schema}.${index}` };
  }

  // ── Identifikator haqiqatan mavjudligini tasdiqlash ──────────────
  // relkind: 'r' = oddiy jadval, 'i' = indeks
  private async assertRelationExists(
    targetId: string,
    schema: string,
    name: string,
    relkind: 'r' | 'i',
  ): Promise<void> {
    const rows = await this.poolManager.query<{ exists: boolean }>(
      targetId,
      `
      SELECT EXISTS(
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind = $3
      ) AS exists
    `,
      [schema, name, relkind],
    );

    if (!rows[0]?.exists) {
      const kind = relkind === 'r' ? 'table' : 'index';
      throw new NotFoundException(
        `${kind} "${schema}.${name}" not found on this target`,
      );
    }
  }

  // ── Fon rejimida ishga tushirish ──────────────────────────────
  // pool.query() natijasini HTTP javobi kutmasdan chaqiramiz —
  // VACUUM/REINDEX daqiqalab davom etishi mumkin, foydalanuvchini
  // kutdirmaymiz. onDone callback audit-log yozish uchun.
  private runInBackground(
    targetId: string,
    sql: string,
    onDone: (success: boolean, error?: string) => Promise<void>,
  ): void {
    this.logger.log(
      `Running maintenance command on target ${targetId}: ${sql}`,
    );
    this.poolManager
      .query(targetId, sql)
      .then(() => {
        this.logger.log(`Maintenance command completed: ${sql}`);
        return onDone(true);
      })
      .catch((err: Error) => {
        this.logger.warn(`Maintenance command failed: ${sql} — ${err.message}`);
        return onDone(false, err.message);
      })
      .catch((err) => {
        // onDone'ning o'zi (audit yozish) xato bersa ham dasturni yiqitmaymiz
        this.logger.error(
          `Failed to record maintenance audit log: ${(err as Error).message}`,
        );
      });
  }
}
