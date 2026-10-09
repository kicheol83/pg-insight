import type { Dictionary } from "../locales";

export const targets = {
  "targets.subtitle": {
    ko: "모니터링 중인 PostgreSQL 인스턴스",
    en: "Monitored PostgreSQL instances",
    uz: "Kuzatuvdagi PostgreSQL serverlari",
  },
  "targets.add": { ko: "대상 추가", en: "Add target", uz: "Target qo'shish" },
  "targets.removeConfirm": {
    ko: '"{name}" 대상을 삭제하시겠습니까? 모니터링이 중지됩니다.',
    en: 'Remove "{name}"? This will stop monitoring.',
    uz: "\"{name}\" o'chirilsinmi? Monitoring to'xtatiladi.",
  },
  "targets.removed": {
    ko: "대상이 삭제되었습니다",
    en: "Target removed",
    uz: "Target o'chirildi",
  },
  "targets.removeFailed": {
    ko: "삭제 실패",
    en: "Failed to remove",
    uz: "O'chirib bo'lmadi",
  },
  "targets.actionFailed": {
    ko: "작업 실패",
    en: "Action failed",
    uz: "Amal bajarilmadi",
  },
  "targets.statTotal": { ko: "전체", en: "Total", uz: "Jami" },
  "targets.statActive": { ko: "활성", en: "Active", uz: "Faol" },
  "targets.statErrors": { ko: "오류", en: "Errors", uz: "Xatolar" },
  "targets.statCollecting": {
    ko: "수집 중",
    en: "Collecting",
    uz: "Yig'ilmoqda",
  },
  "targets.emptyMessage": {
    ko: "첫 PostgreSQL 인스턴스를 추가하고 모니터링을 시작하세요",
    en: "Add your first PostgreSQL instance to start monitoring",
    uz: "Monitoringni boshlash uchun birinchi PostgreSQL serveringizni qo'shing",
  },
  "targets.status.active": { ko: "활성", en: "active", uz: "faol" },
  "targets.status.connecting": {
    ko: "연결 중",
    en: "connecting",
    uz: "ulanmoqda",
  },
  "targets.status.error": { ko: "오류", en: "error", uz: "xatolik" },
  "targets.status.paused": {
    ko: "일시 중지됨",
    en: "paused",
    uz: "to'xtatilgan",
  },
  "targets.pool": { ko: "풀", en: "Pool", uz: "Pool" },
  "targets.poolIdle": {
    ko: "유휴 {count}",
    en: "{count} idle",
    uz: "{count} bo'sh",
  },
  "targets.pgVersion": {
    ko: "PG 버전",
    en: "PG Version",
    uz: "PG versiyasi",
  },
  "targets.lastCollected": {
    ko: "마지막 수집",
    en: "Last collected",
    uz: "Oxirgi yig'ish",
  },
  "targets.collecting": { ko: "수집 중", en: "collecting", uz: "yig'ilmoqda" },
  "targets.resume": { ko: "재개", en: "Resume", uz: "Davom ettirish" },
  "targets.pause": { ko: "일시 중지", en: "Pause", uz: "To'xtatish" },
  "targets.added": {
    ko: "대상이 추가되었습니다",
    en: "Target added",
    uz: "Target qo'shildi",
  },
  "targets.addedMessage": {
    ko: "{name} 모니터링을 시작했습니다",
    en: "{name} is now being monitored",
    uz: "{name} endi kuzatilmoqda",
  },
  "targets.addFailed": {
    ko: "대상 추가 실패",
    en: "Failed to add target",
    uz: "Target qo'shib bo'lmadi",
  },
  "targets.testConnection": {
    ko: "연결 테스트",
    en: "Test connection",
    uz: "Ulanishni tekshirish",
  },
  "targets.displayName": {
    ko: "표시 이름",
    en: "Display name",
    uz: "Ko'rinadigan nom",
  },
  "targets.displayNamePlaceholder": {
    ko: "운영 DB",
    en: "Production DB",
    uz: "Production DB",
  },
  "targets.host": { ko: "호스트", en: "Host", uz: "Host" },
  "targets.hostPlaceholder": {
    ko: "localhost 또는 IP",
    en: "localhost or IP",
    uz: "localhost yoki IP",
  },
  "targets.port": { ko: "포트", en: "Port", uz: "Port" },
  "targets.database": {
    ko: "데이터베이스",
    en: "Database",
    uz: "Ma'lumotlar bazasi",
  },
  "targets.username": {
    ko: "사용자 이름",
    en: "Username",
    uz: "Foydalanuvchi nomi",
  },
  "targets.password": { ko: "비밀번호", en: "Password", uz: "Parol" },
  "targets.sslMode": { ko: "SSL 모드", en: "SSL Mode", uz: "SSL rejimi" },
  "targets.ssl.disable": {
    ko: "disable (TLS 미사용)",
    en: "Disable (no TLS)",
    uz: "disable (TLS'siz)",
  },
  "targets.ssl.require": {
    ko: "require (기본값)",
    en: "Require (default)",
    uz: "require (standart)",
  },
  "targets.ssl.verifyCa": {
    ko: "verify-ca (CA 검증)",
    en: "Verify CA",
    uz: "verify-ca (CA tekshiruvi)",
  },
  "targets.ssl.verifyFull": {
    ko: "verify-full (전체 검증)",
    en: "Verify Full",
    uz: "verify-full (to'liq tekshiruv)",
  },
  "targets.testSuccess": {
    ko: "연결에 성공했습니다!",
    en: "Connection successful!",
    uz: "Ulanish muvaffaqiyatli!",
  },
  "targets.testDetails": {
    ko: "PostgreSQL {version} · 지연 시간 {latency}ms",
    en: "PostgreSQL {version} · latency {latency}ms",
    uz: "PostgreSQL {version} · kechikish {latency}ms",
  },
  "targets.testFailed": {
    ko: "연결 실패",
    en: "Connection failed",
    uz: "Ulanib bo'lmadi",
  },
  "targets.requiredPermission": {
    ko: "필요한 PostgreSQL 권한:",
    en: "Required PostgreSQL permission:",
    uz: "Kerakli PostgreSQL ruxsati:",
  },
} satisfies Dictionary;
