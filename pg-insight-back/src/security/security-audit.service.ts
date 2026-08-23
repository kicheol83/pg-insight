import { Injectable } from '@nestjs/common';
import { TargetPoolManager } from '../targets/target-pool.manager';

export interface SecurityCheck {
  id: string;
  title: string;
  status: 'ok' | 'warning' | 'info' | 'unavailable';
  message: string;
  items?: string[];
  recommendation?: string;
}

export interface SecurityAuditReport {
  targetId: string;
  checkedAt: string;
  checks: SecurityCheck[];
}

@Injectable()
export class SecurityAuditService {
  constructor(private readonly poolManager: TargetPoolManager) {}

  async runAudit(targetId: string): Promise<SecurityAuditReport> {
    const checks = await Promise.all([
      this.checkSuperusers(targetId),
      this.checkDangerousPrivileges(targetId),
      this.checkPublicSchemaPrivilege(targetId),
      this.checkSsl(targetId),
      this.checkPasswordEncryption(targetId),
      this.checkHbaWeakAuth(targetId),
    ]);

    return { targetId, checkedAt: new Date().toISOString(), checks };
  }

  private async checkSuperusers(targetId: string): Promise<SecurityCheck> {
    try {
      const rows = await this.poolManager.query<{ rolname: string }>(
        targetId,
        `
        SELECT rolname FROM pg_roles WHERE rolsuper = true ORDER BY rolname
      `,
      );
      const names = rows.map((r) => r.rolname);
      return {
        id: 'superusers',
        title: 'Superuser rollari',
        status: names.length > 2 ? 'warning' : 'info',
        message: `${names.length} ta superuser topildi`,
        items: names,
        recommendation:
          names.length > 2
            ? "Ko'p superuser — least privilege tamoyiliga ko'ra, superuser huquqini faqat haqiqatan kerak bo'lgan rollarga qoldiring."
            : undefined,
      };
    } catch (err) {
      return this.unavailable('superusers', 'Superuser rollari', err);
    }
  }

  private async checkDangerousPrivileges(
    targetId: string,
  ): Promise<SecurityCheck> {
    try {
      const rows = await this.poolManager.query<{
        rolname: string;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolbypassrls: boolean;
        rolreplication: boolean;
      }>(
        targetId,
        `
        SELECT rolname, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication
        FROM pg_roles
        WHERE rolsuper = false AND rolcanlogin = true
          AND (rolcreatedb OR rolcreaterole OR rolbypassrls OR rolreplication)
        ORDER BY rolname
      `,
      );
      const items = rows.map((r) => {
        const flags = [
          r.rolcreatedb && 'CREATEDB',
          r.rolcreaterole && 'CREATEROLE',
          r.rolbypassrls && 'BYPASSRLS',
          r.rolreplication && 'REPLICATION',
        ]
          .filter(Boolean)
          .join(', ');
        return `${r.rolname} (${flags})`;
      });
      return {
        id: 'dangerous_privileges',
        title: 'Kengaytirilgan huquqli login rollari',
        status: items.length > 0 ? 'warning' : 'ok',
        message:
          items.length > 0
            ? `${items.length} ta login rol superuser bo'lmasa-da kengaytirilgan huquqqa ega`
            : "Kengaytirilgan huquqli qo'shimcha rol topilmadi",
        items,
        recommendation:
          items.length > 0
            ? "BYPASSRLS ayniqsa e'tiborli bo'lishi kerak — bu rol Row Level Security qoidalarini butunlay chetlab o'tadi."
            : undefined,
      };
    } catch (err) {
      return this.unavailable(
        'dangerous_privileges',
        'Kengaytirilgan huquqli login rollari',
        err,
      );
    }
  }

  private async checkPublicSchemaPrivilege(
    targetId: string,
  ): Promise<SecurityCheck> {
    try {
      const rows = await this.poolManager.query<{ can_create: boolean }>(
        targetId,
        `
        SELECT has_schema_privilege('public', 'public', 'CREATE') AS can_create
      `,
      );
      const canCreate = rows[0]?.can_create ?? false;
      return {
        id: 'public_schema_create',
        title: "PUBLIC roli 'public' schema'da CREATE huquqi",
        status: canCreate ? 'warning' : 'ok',
        message: canCreate
          ? "Har qanday autentifikatsiya qilingan foydalanuvchi 'public' schema'da jadval/obyekt yarata oladi"
          : "PUBLIC roli 'public' schema'da CREATE huquqiga ega emas (xavfsiz default)",
        recommendation: canCreate
          ? "REVOKE CREATE ON SCHEMA public FROM PUBLIC; — bu buyruqni o'zingiz qo'lda, ta'sirini tushunib bajaring (mavjud ilovalarni buzishi mumkin)."
          : undefined,
      };
    } catch (err) {
      return this.unavailable(
        'public_schema_create',
        "PUBLIC roli 'public' schema'da CREATE huquqi",
        err,
      );
    }
  }

  private async checkSsl(targetId: string): Promise<SecurityCheck> {
    try {
      const sslSettingRows = await this.poolManager.query<{ setting: string }>(
        targetId,
        `SELECT setting FROM pg_settings WHERE name = 'ssl'`,
      );
      const sslEnabled = sslSettingRows[0]?.setting === 'on';

      let unencryptedCount = 0;
      let totalCount = 0;
      try {
        const connRows = await this.poolManager.query<{
          ssl: boolean;
          cnt: string;
        }>(
          targetId,
          `
          SELECT s.ssl, count(*) AS cnt
          FROM pg_stat_ssl s
          JOIN pg_stat_activity a ON a.pid = s.pid
          WHERE a.pid != pg_backend_pid()
          GROUP BY s.ssl
        `,
        );
        for (const r of connRows) {
          const cnt = Number(r.cnt);
          totalCount += cnt;
          if (!r.ssl) unencryptedCount += cnt;
        }
      } catch {}

      const status = !sslEnabled
        ? 'warning'
        : unencryptedCount > 0
          ? 'info'
          : 'ok';
      return {
        id: 'ssl',
        title: 'SSL/TLS holati',
        status,
        message: !sslEnabled
          ? "SSL server darajasida o'chirilgan — barcha trafik (parollar ham) shifrlanmagan holda uzatiladi"
          : totalCount > 0
            ? `SSL yoqilgan — hozirgi ${totalCount} ulanishdan ${unencryptedCount} tasi shifrlanmagan`
            : 'SSL server darajasida yoqilgan',
        recommendation: !sslEnabled
          ? 'postgresql.conf faylida ssl = on qiling va sertifikat sozlang.'
          : unencryptedCount > 0
            ? "pg_hba.conf'da hostssl yozuvlaridan foydalanib, shifrlanmagan ulanishlarni butunlay taqiqlashni ko'rib chiqing."
            : undefined,
      };
    } catch (err) {
      return this.unavailable('ssl', 'SSL/TLS holati', err);
    }
  }

  private async checkPasswordEncryption(
    targetId: string,
  ): Promise<SecurityCheck> {
    try {
      const rows = await this.poolManager.query<{ setting: string }>(
        targetId,
        `SELECT setting FROM pg_settings WHERE name = 'password_encryption'`,
      );
      const method = rows[0]?.setting ?? 'unknown';
      return {
        id: 'password_encryption',
        title: 'Parol xeshlash usuli',
        status: method === 'scram-sha-256' ? 'ok' : 'warning',
        message: `Joriy usul: ${method}`,
        recommendation:
          method !== 'scram-sha-256'
            ? "SET password_encryption = 'scram-sha-256'; — bu faqat YANGI o'rnatiladigan parollarga ta'sir qiladi, mavjud foydalanuvchilar parolni qayta o'rnatishi kerak bo'ladi."
            : undefined,
      };
    } catch (err) {
      return this.unavailable(
        'password_encryption',
        'Parol xeshlash usuli',
        err,
      );
    }
  }

  private async checkHbaWeakAuth(targetId: string): Promise<SecurityCheck> {
    try {
      const rows = await this.poolManager.query<{
        type: string;
        database: string[];
        user_name: string[];
        address: string | null;
        auth_method: string;
      }>(
        targetId,
        `
        SELECT type, database, user_name, address, auth_method
        FROM pg_hba_file_rules
        WHERE auth_method IN ('trust', 'password')
        ORDER BY line_number
      `,
      );
      const items = rows.map(
        (r) =>
          `${r.type} ${r.database?.join(',') ?? '?'} ${r.user_name?.join(',') ?? '?'} ${r.address ?? ''} → ${r.auth_method}`,
      );
      const hasTrust = rows.some((r) => r.auth_method === 'trust');
      return {
        id: 'hba_weak_auth',
        title: 'pg_hba.conf — zaif autentifikatsiya qoidalari',
        status: items.length === 0 ? 'ok' : hasTrust ? 'warning' : 'info',
        message:
          items.length === 0
            ? "'trust' yoki shifrlanmagan 'password' autentifikatsiya usuli topilmadi"
            : `${items.length} ta qoida zaif autentifikatsiya ishlatadi${hasTrust ? " (shu jumladan 'trust' — parolsiz kirish!)" : ''}`,
        items,
        recommendation:
          items.length > 0
            ? "'trust' — parolsiz kirishga ruxsat beradi (faqat localhost'da, ehtiyotkorlik bilan ishlatilishi kerak). 'password' — parolni shifrlanmagan holda uzatadi, 'scram-sha-256'ga almashtiring."
            : undefined,
      };
    } catch (err) {
      return this.unavailable(
        'hba_weak_auth',
        'pg_hba.conf — zaif autentifikatsiya qoidalari',
        err,
      );
    }
  }

  private unavailable(id: string, title: string, err: unknown): SecurityCheck {
    return {
      id,
      title,
      status: 'unavailable',
      message: `Bu tekshiruv uchun yetarli ruxsat yo'q yoki ma'lumot olinmadi: ${(err as Error).message}`,
    };
  }
}
