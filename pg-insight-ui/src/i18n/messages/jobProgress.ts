import type { Dictionary } from "../locales";

export const jobProgress = {
  "jobProgress.subtitle": {
    ko: "CREATE INDEX, CLUSTER, ANALYZE, COPY 작업",
    en: "CREATE INDEX, CLUSTER, ANALYZE, COPY operations",
    uz: "CREATE INDEX, CLUSTER, ANALYZE, COPY jarayonlari",
  },
  "jobProgress.noTarget": {
    ko: "모니터링 대상이 선택되지 않았습니다",
    en: "No target selected",
    uz: "Target tanlanmagan",
  },
  "jobProgress.refreshInterval": {
    ko: "5초마다 갱신",
    en: "Refreshes every 5s",
    uz: "5s yangilanish",
  },
  "jobProgress.activeCount": {
    ko: "실행 중인 작업 {count}개",
    en: "{count} active jobs",
    uz: "{count} ta faol jarayon",
  },
  "jobProgress.createIndexSubtitle": {
    ko: "인덱스 생성 작업 (CONCURRENTLY 포함)",
    en: "Index builds (including CONCURRENTLY)",
    uz: "Indeks yaratish jarayoni (CONCURRENTLY holatlarida ham)",
  },
  "jobProgress.noActive": {
    ko: "실행 중인 작업이 없습니다",
    en: "No active jobs",
    uz: "Faol jarayon yo'q",
  },
  "jobProgress.noCreateIndexMessage": {
    ko: "인덱스를 생성하면 여기에 표시됩니다",
    en: "Index builds will appear here while they run",
    uz: "Yangi indeks yaratilayotganda shu yerda ko'rinadi",
  },
  "jobProgress.clusterSubtitle": {
    ko: "테이블 전체 재작성 작업",
    en: "Full table rewrite operations",
    uz: "Jadvalni butunlay qayta yozish jarayoni",
  },
  "jobProgress.analyzeSubtitle": {
    ko: "통계 수집 작업",
    en: "Statistics collection",
    uz: "Statistika yig'ish jarayoni",
  },
  "jobProgress.copySubtitle": {
    ko: "가져오기/내보내기 작업 (대용량 CSV 적재 등)",
    en: "Import/export operations (large CSV loads, etc.)",
    uz: "Import/export jarayoni (katta CSV yuklash va h.k.)",
  },
  "jobProgress.blocks": {
    ko: "{done}/{total} 블록",
    en: "{done}/{total} blocks",
    uz: "{done}/{total} blok",
  },
  "jobProgress.rows": {
    ko: "{count}행",
    en: "{count} rows",
    uz: "{count} qator",
  },
} satisfies Dictionary;
