import type { Dictionary } from "../locales";

export const dashboard = {
  "dashboard.subtitle": {
    ko: "실시간 PostgreSQL 현황",
    en: "Real-time PostgreSQL overview",
    uz: "PostgreSQL holati real vaqtda",
  },
  "dashboard.noTarget": {
    ko: "선택된 대상이 없습니다",
    en: "No target selected",
    uz: "Target tanlanmagan",
  },
  "dashboard.noTargetHint": {
    ko: "PostgreSQL 대상을 추가하면 데이터베이스를 실시간으로 모니터링할 수 있습니다.",
    en: "Add a PostgreSQL target to start monitoring your database in real time.",
    uz: "Ma'lumotlar bazasini real vaqtda kuzatishni boshlash uchun PostgreSQL target qo'shing.",
  },
  "dashboard.updated": {
    ko: "{time} 업데이트됨",
    en: "Updated {time}",
    uz: "{time} yangilandi",
  },
  "dashboard.active": { ko: "활성", en: "Active", uz: "Faol" },
  "dashboard.idle": { ko: "유휴", en: "Idle", uz: "Bo'sh" },
  "dashboard.total": { ko: "전체", en: "Total", uz: "Jami" },
  "dashboard.idleInTx": {
    ko: "트랜잭션 내 유휴",
    en: "Idle in tx",
    uz: "Tranzaksiyada bo'sh",
  },
  "dashboard.poolUsage": {
    ko: "풀 사용률",
    en: "Pool usage",
    uz: "Pool bandligi",
  },
  "dashboard.critical": { ko: "위험", en: "Critical", uz: "Kritik" },
  "dashboard.high": { ko: "높음", en: "High", uz: "Yuqori" },
  "dashboard.normal": { ko: "정상", en: "Normal", uz: "Normal" },
  "dashboard.max": { ko: "최대", en: "Max", uz: "Maks" },
  "dashboard.slowCount": {
    ko: "느린 쿼리 {count}건",
    en: "{count} slow",
    uz: "{count} ta sekin",
  },
  "dashboard.slowQueries": {
    ko: "느린 쿼리 (1시간)",
    en: "Slow queries (1h)",
    uz: "Sekin so'rovlar (1 soat)",
  },
  "dashboard.cacheHit": { ko: "캐시 적중률", en: "Cache hit", uz: "Kesh hit" },
  "dashboard.waitingCount": {
    ko: "{count}건 대기 중",
    en: "{count} waiting",
    uz: "{count} ta kutmoqda",
  },
  "dashboard.lockWaits": {
    ko: "락 대기 (1시간)",
    en: "Lock waits (1h)",
    uz: "Qulf kutishlari (1 soat)",
  },
  "dashboard.deadlocks": {
    ko: "데드락",
    en: "Deadlocks",
    uz: "Deadlock'lar",
  },
  "dashboard.xidAge": { ko: "XID age", en: "XID Age", uz: "XID yoshi" },
  "dashboard.risk": { ko: "위험", en: "Risk", uz: "Xavf" },
  "dashboard.replicationLag": {
    ko: "복제 지연",
    en: "Replication lag",
    uz: "Replikatsiya kechikishi",
  },
  "dashboard.notReplicating": {
    ko: "복제 안 함",
    en: "Not replicating",
    uz: "Replikatsiya yo'q",
  },
  "dashboard.activeVacuums": {
    ko: "실행 중인 VACUUM",
    en: "Active vacuums",
    uz: "Faol VACUUM'lar",
  },
  "dashboard.longestQuery": {
    ko: "최장 실행 쿼리",
    en: "Longest query",
    uz: "Eng uzun so'rov",
  },
  "dashboard.connectionTrend": {
    ko: "커넥션 추이",
    en: "Connection trend",
    uz: "Ulanishlar dinamikasi",
  },
  "dashboard.lastHours": {
    ko: "최근 {hours}시간",
    en: "Last {hours}h",
    uz: "Oxirgi {hours} soat",
  },
  "dashboard.lockWaitEvents": {
    ko: "락 대기 이벤트",
    en: "Lock wait events",
    uz: "Qulf kutish hodisalari",
  },
  "dashboard.waiting": { ko: "대기", en: "Waiting", uz: "Kutmoqda" },
  "dashboard.bufferCacheHit": {
    ko: "버퍼 캐시 적중률",
    en: "Buffer cache hit ratio",
    uz: "Bufer kesh hit ulushi",
  },
  "dashboard.cacheHitGoal": {
    ko: "목표: > 99%",
    en: "Target: > 99%",
    uz: "Maqsad: > 99%",
  },
  "dashboard.connectionsByApp": {
    ko: "애플리케이션별 커넥션",
    en: "Connections by application",
    uz: "Ilovalar bo'yicha ulanishlar",
  },
  "dashboard.currentSnapshot": {
    ko: "현재 스냅샷",
    en: "Current snapshot",
    uz: "Joriy holat",
  },
  "dashboard.connectionDataEmpty": {
    ko: "커넥션 데이터가 수집되면 여기에 표시됩니다",
    en: "Connection data will appear here",
    uz: "Ulanish ma'lumotlari shu yerda ko'rinadi",
  },
  "dashboard.bloatTitle": {
    ko: "블로트가 가장 큰 테이블",
    en: "Tables with highest bloat",
    uz: "Bloat eng yuqori bo'lgan jadvallar",
  },
  "dashboard.bloatSubtitle": {
    ko: "dead tuple 비율 — VACUUM을 실행해 공간을 회수하세요",
    en: "Dead tuples ratio — run VACUUM to reclaim space",
    uz: "Dead tuple ulushi — joyni bo'shatish uchun VACUUM ishga tushiring",
  },
} satisfies Dictionary;
