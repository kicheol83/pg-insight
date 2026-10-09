import type { Dictionary } from "../locales";

export const vacuum = {
  "vacuum.title": {
    ko: "VACUUM & XID",
    en: "Vacuum & XID",
    uz: "Vacuum va XID",
  },
  "vacuum.subtitle": {
    ko: "autovacuum 상태 및 트랜잭션 ID wraparound 방지",
    en: "Autovacuum health & transaction ID wraparound prevention",
    uz: "Autovacuum holati va tranzaksiya ID wraparound'ining oldini olish",
  },
  "vacuum.xidRisk": {
    ko: "XID wraparound 위험!",
    en: "XID wraparound risk!",
    uz: "XID wraparound xavfi!",
  },
  "vacuum.autovacuumDisabled": {
    ko: "autovacuum이 전역으로 비활성화됨",
    en: "Autovacuum disabled globally",
    uz: "Autovacuum global miqyosda o'chirilgan",
  },
  "vacuum.dbXidAge": {
    ko: "데이터베이스 XID 나이",
    en: "Database XID age",
    uz: "Ma'lumotlar bazasi XID yoshi",
  },
  "vacuum.dbXidAgeSubtitle": {
    ko: "트랜잭션 wraparound 근접도 — VACUUM FREEZE로 초기화됩니다",
    en: "Transaction wraparound proximity — VACUUM FREEZE resets this",
    uz: "Tranzaksiya wraparound'iga yaqinlik — VACUUM FREEZE buni qayta tiklaydi",
  },
  "vacuum.maxTableXidAge": {
    ko: "테이블 최대 XID 나이",
    en: "Max table XID age",
    uz: "Jadvallardagi eng katta XID yoshi",
  },
  "vacuum.freezeMaxAge": {
    ko: "freeze 최대 나이",
    en: "Freeze max age",
    uz: "Freeze maksimal yoshi",
  },
  "vacuum.autovacuumStatus": {
    ko: "autovacuum 상태",
    en: "Autovacuum status",
    uz: "Autovacuum holati",
  },
  "vacuum.workers": { ko: "워커", en: "Workers", uz: "Worker'lar" },
  "vacuum.enabled": { ko: "활성화", en: "Enabled", uz: "Yoqilgan" },
  "vacuum.yes": { ko: "예", en: "Yes", uz: "Ha" },
  "vacuum.no": { ko: "아니요", en: "No", uz: "Yo'q" },
  "vacuum.pendingVacuum": {
    ko: "VACUUM 대기",
    en: "Pending vacuum",
    uz: "Vacuum kutilmoqda",
  },
  "vacuum.pendingAnalyze": {
    ko: "ANALYZE 대기",
    en: "Pending analyze",
    uz: "Analyze kutilmoqda",
  },
  "vacuum.xidTrend": {
    ko: "XID 나이 추이 (24시간)",
    en: "XID age trend (24h)",
    uz: "XID yoshi trendi (24 soat)",
  },
  "vacuum.xidTrendSubtitle": {
    ko: "감소 없이 계속 증가하는지 확인하세요 — 감소는 freeze가 성공했다는 뜻입니다",
    en: "Watch for continuous growth without drops — drops mean a successful freeze",
    uz: "Pasaymasdan uzluksiz o'sishiga e'tibor bering — pasayish freeze muvaffaqiyatli bo'lganini bildiradi",
  },
  "vacuum.freezeThreshold": {
    ko: "freeze 임계값",
    en: "freeze threshold",
    uz: "freeze chegarasi",
  },
  "vacuum.danger": { ko: "위험", en: "danger", uz: "xavfli" },
  "vacuum.runningVacuums": {
    ko: "실행 중인 VACUUM",
    en: "Running vacuums",
    uz: "Ishlayotgan vacuum'lar",
  },
  "vacuum.activeCount": {
    ko: "{count}개 실행 중",
    en: "{count} active",
    uz: "{count} ta faol",
  },
  "vacuum.noVacuums": {
    ko: "실행 중인 VACUUM이 없습니다",
    en: "No vacuums running",
    uz: "Ishlayotgan vacuum yo'q",
  },
  "vacuum.noVacuumsMessage": {
    ko: "실행 중인 VACUUM 작업이 실시간 진행률과 함께 여기에 표시됩니다",
    en: "Active VACUUM operations will appear here with live progress",
    uz: "Faol VACUUM jarayonlari shu yerda jonli progress bilan ko'rinadi",
  },
  "vacuum.auto": { ko: "자동", en: "auto", uz: "avto" },
  "vacuum.blocks": {
    ko: "{scanned}/{total} 블록",
    en: "{scanned}/{total} blocks",
    uz: "{scanned}/{total} blok",
  },
  "vacuum.atRiskTables": {
    ko: "wraparound 위험 테이블",
    en: "Tables at wraparound risk",
    uz: "Wraparound xavfi ostidagi jadvallar",
  },
  "vacuum.sortedByXidAge": {
    ko: "XID 나이순 정렬",
    en: "Sorted by XID age",
    uz: "XID yoshi bo'yicha saralangan",
  },
  "vacuum.noAtRisk": {
    ko: "위험한 테이블이 없습니다",
    en: "No at-risk tables",
    uz: "Xavf ostidagi jadval yo'q",
  },
  "vacuum.noAtRiskMessage": {
    ko: "모든 테이블이 안전한 XID 범위 내에 있습니다",
    en: "All tables are well within safe XID range",
    uz: "Barcha jadvallar xavfsiz XID oralig'ida",
  },
  "vacuum.colTable": { ko: "테이블", en: "Table", uz: "Jadval" },
  "vacuum.colXidAge": { ko: "XID 나이", en: "XID age", uz: "XID yoshi" },
  "vacuum.colStatus": { ko: "상태", en: "Status", uz: "Holat" },
  "vacuum.ageStatus.warning": {
    ko: "경고",
    en: "warning",
    uz: "ogohlantirish",
  },
  "vacuum.ageStatus.critical": { ko: "심각", en: "critical", uz: "kritik" },
  "vacuum.ageStatus.emergency": {
    ko: "긴급",
    en: "emergency",
    uz: "favqulodda",
  },
  "vacuum.gaugeLimit": {
    ko: "wraparound 한계 2B 기준",
    en: "of 2B wraparound limit",
    uz: "2B wraparound chegarasidan",
  },
} satisfies Dictionary;
