import type { Dictionary } from "../locales";

export const locks = {
  "locks.updated": {
    ko: "업데이트: {time}",
    en: "Updated {time}",
    uz: "Yangilandi: {time}",
  },
  "locks.subtitle": {
    ko: "실시간 락 모니터링",
    en: "Live lock monitoring",
    uz: "Jonli qulf monitoringi",
  },
  "locks.refreshEvery3s": {
    ko: "3초 간격 갱신",
    en: "3s refresh",
    uz: "Har 3s yangilanadi",
  },
  "locks.criticalDetected": {
    ko: "심각한 락 감지됨",
    en: "Critical lock detected",
    uz: "Kritik qulf aniqlandi",
  },
  "locks.deadlockRisk": {
    ko: "데드락 위험",
    en: "Deadlock risk",
    uz: "Deadlock xavfi",
  },
  "locks.totalLocks": { ko: "전체 락", en: "Total locks", uz: "Jami qulflar" },
  "locks.waitingLocks": {
    ko: "대기 중인 락",
    en: "Waiting locks",
    uz: "Kutayotgan qulflar",
  },
  "locks.blockingChains": {
    ko: "블로킹 체인",
    en: "Blocking chains",
    uz: "Bloklash zanjirlari",
  },
  "locks.deadlocksTotal": {
    ko: "데드락 (누적)",
    en: "Deadlocks (total)",
    uz: "Deadlock'lar (jami)",
  },
  "locks.whoBlocksWhom": {
    ko: "누가 누구를 블로킹하고 있는지 보여줍니다",
    en: "Who is blocking whom",
    uz: "Kim kimni bloklayapti",
  },
  "locks.none": { ko: "없음", en: "None", uz: "Yo'q" },
  "locks.noChains": {
    ko: "블로킹 체인이 감지되지 않았습니다",
    en: "No blocking chains detected",
    uz: "Bloklash zanjirlari aniqlanmadi",
  },
  "locks.noChainsMessage": {
    ko: "모든 커넥션이 정상적으로 실행 중입니다",
    en: "All connections are running freely",
    uz: "Barcha ulanishlar erkin ishlamoqda",
  },
  "locks.lockModes": { ko: "락 모드", en: "Lock modes", uz: "Qulf rejimlari" },
  "locks.noLocks": { ko: "락 없음", en: "No locks", uz: "Qulflar yo'q" },
  "locks.blocker": { ko: "블로커", en: "BLOCKER", uz: "BLOKLOVCHI" },
  "locks.table": { ko: "테이블:", en: "Table:", uz: "Jadval:" },
  "locks.lock": { ko: "락:", en: "Lock:", uz: "Qulf:" },
  "locks.waiterOne": {
    ko: "대기 {count}건",
    en: "{count} waiter",
    uz: "{count} ta kutuvchi",
  },
  "locks.waiterMany": {
    ko: "대기 {count}건",
    en: "{count} waiters",
    uz: "{count} ta kutuvchi",
  },
  "locks.waiting": { ko: "대기 중", en: "WAITING", uz: "KUTMOQDA" },
  "locks.wants": { ko: "요청:", en: "Wants:", uz: "So'raydi:" },
  "locks.waitingFor": {
    ko: "{duration} 대기 중",
    en: "Waiting {duration}",
    uz: "{duration} kutmoqda",
  },
  "locks.severity.critical": { ko: "심각", en: "critical", uz: "kritik" },
  "locks.severity.high": { ko: "높음", en: "high", uz: "yuqori" },
  "locks.severity.medium": { ko: "보통", en: "medium", uz: "o'rta" },
  "locks.severity.low": { ko: "낮음", en: "low", uz: "past" },
} satisfies Dictionary;
