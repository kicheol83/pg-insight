import type { Dictionary } from "../locales";

export const connections = {
  "connections.updated": {
    ko: "{time} 업데이트됨",
    en: "Updated {time}",
    uz: "{time} yangilandi",
  },
  "connections.subtitle": {
    ko: "실시간 세션 모니터링",
    en: "Live session monitoring",
    uz: "Seanslarni jonli kuzatish",
  },
  "connections.waitingForLock": {
    ko: "락 대기 {count}건",
    en: "{count} waiting for lock",
    uz: "{count} ta qulf kutmoqda",
  },
  "connections.idleInTxCount": {
    ko: "트랜잭션 내 유휴 {count}건",
    en: "{count} idle in tx",
    uz: "{count} ta tranzaksiyada bo'sh",
  },
  "connections.total": { ko: "전체", en: "Total", uz: "Jami" },
  "connections.active": { ko: "활성", en: "Active", uz: "Faol" },
  "connections.idle": { ko: "유휴", en: "Idle", uz: "Bo'sh" },
  "connections.idleInTx": {
    ko: "트랜잭션 내 유휴",
    en: "Idle in tx",
    uz: "Tranzaksiyada bo'sh",
  },
  "connections.lockWait": { ko: "락 대기", en: "Lock wait", uz: "Qulf kutish" },
  "connections.maxAllowed": {
    ko: "최대 허용",
    en: "Max allowed",
    uz: "Maks. ruxsat",
  },
  "connections.poolUtilization": {
    ko: "풀 사용률",
    en: "Pool utilization",
    uz: "Pool bandligi",
  },
  "connections.used": {
    ko: "{count} 사용 중",
    en: "{count} used",
    uz: "{count} band",
  },
  "connections.max": {
    ko: "최대 {count}",
    en: "{count} max",
    uz: "maks. {count}",
  },
  "connections.longestQuery": {
    ko: "최장 실행 쿼리",
    en: "Longest query",
    uz: "Eng uzun so'rov",
  },
  "connections.trend": {
    ko: "커넥션 추이 (1시간)",
    en: "Connection trend (1h)",
    uz: "Ulanishlar dinamikasi (1 soat)",
  },
  "connections.byApplication": {
    ko: "애플리케이션별",
    en: "By application",
    uz: "Ilovalar bo'yicha",
  },
  "connections.unknownApp": {
    ko: "(알 수 없음)",
    en: "(unknown)",
    uz: "(noma'lum)",
  },
  "connections.activeSessions": {
    ko: "활성 세션",
    en: "Active sessions",
    uz: "Faol seanslar",
  },
  "connections.allStates": {
    ko: "모든 상태",
    en: "All states",
    uz: "Barcha holatlar",
  },
  "connections.allDurations": {
    ko: "모든 실행 시간",
    en: "All durations",
    uz: "Barcha davomiyliklar",
  },
  "connections.searchPlaceholder": {
    ko: "사용자, 앱, 쿼리 검색…",
    en: "Search user, app, query…",
    uz: "Foydalanuvchi, ilova, so'rov bo'yicha qidirish…",
  },
  "connections.clear": { ko: "초기화", en: "Clear", uz: "Tozalash" },
  "connections.emptyFiltered": {
    ko: "필터와 일치하는 세션이 없습니다",
    en: "No sessions match the filter",
    uz: "Filtrga mos seans yo'q",
  },
  "connections.colState": { ko: "상태", en: "State", uz: "Holat" },
  "connections.colUserApp": {
    ko: "사용자 / 앱",
    en: "User / App",
    uz: "Foydalanuvchi / Ilova",
  },
  "connections.colWaitEvent": {
    ko: "대기 이벤트",
    en: "Wait event",
    uz: "Kutish hodisasi",
  },
  "connections.colDuration": {
    ko: "실행 시간",
    en: "Duration",
    uz: "Davomiylik",
  },
  "connections.colQuery": { ko: "쿼리", en: "Query", uz: "So'rov" },
  "connections.colClient": { ko: "클라이언트", en: "Client", uz: "Mijoz" },
  "connections.local": { ko: "로컬", en: "local", uz: "lokal" },
  "connections.showing": {
    ko: "전체 {total}개 세션 중 {shown}개 표시",
    en: "Showing {shown} of {total} sessions",
    uz: "{total} ta seansdan {shown} tasi ko'rsatilmoqda",
  },
  "connections.state.active": { ko: "활성", en: "active", uz: "faol" },
  "connections.state.idleInTx": {
    ko: "트랜잭션 내 유휴",
    en: "idle in tx",
    uz: "tranzaksiyada bo'sh",
  },
  "connections.state.idle": { ko: "유휴", en: "idle", uz: "bo'sh" },
} satisfies Dictionary;
