import type { Dictionary } from "../locales";

export const queries = {
  "queries.subtitle": {
    ko: "pg_stat_statements 분석 및 EXPLAIN ANALYZE",
    en: "pg_stat_statements analysis & EXPLAIN ANALYZE",
    uz: "pg_stat_statements tahlili va EXPLAIN ANALYZE",
  },
  "queries.slowQueries": {
    ko: "슬로우 쿼리",
    en: "Slow queries",
    uz: "Sekin so'rovlar",
  },
  "queries.uniqueQueries": {
    ko: "고유 쿼리",
    en: "Unique queries",
    uz: "Noyob so'rovlar",
  },
  "queries.slowOver1s": {
    ko: "슬로우 (>1s)",
    en: "Slow (>1s)",
    uz: "Sekin (>1s)",
  },
  "queries.lowCacheHit": {
    ko: "낮은 캐시 히트율",
    en: "Low cache hit",
    uz: "Past cache hit",
  },
  "queries.filter": { ko: "필터:", en: "Filter:", uz: "Filtr:" },
  "queries.all": {
    ko: "전체 ({count})",
    en: "All ({count})",
    uz: "Barchasi ({count})",
  },
  "queries.searchPlaceholder": {
    ko: "쿼리 텍스트 검색…",
    en: "Search query text…",
    uz: "So'rov matnini qidirish…",
  },
  "queries.sort.mean": {
    ko: "정렬: 평균 시간",
    en: "Sort: Mean time",
    uz: "Saralash: o'rtacha vaqt",
  },
  "queries.sort.total": {
    ko: "정렬: 총 시간",
    en: "Sort: Total time",
    uz: "Saralash: umumiy vaqt",
  },
  "queries.sort.calls": {
    ko: "정렬: 호출 수",
    en: "Sort: Calls",
    uz: "Saralash: chaqiruvlar",
  },
  "queries.sort.max": {
    ko: "정렬: 최대 시간",
    en: "Sort: Max time",
    uz: "Saralash: maksimal vaqt",
  },
  "queries.noMatch": {
    ko: "필터에 맞는 쿼리가 없습니다",
    en: "No queries match the filter",
    uz: "Filtrga mos so'rovlar yo'q",
  },
  "queries.col.query": { ko: "쿼리", en: "Query", uz: "So'rov" },
  "queries.col.mean": { ko: "평균", en: "Mean", uz: "O'rtacha" },
  "queries.col.max": { ko: "최대", en: "Max", uz: "Maks" },
  "queries.selectTargetFirst": {
    ko: "먼저 모니터링 대상을 선택하세요",
    en: "Select a target first",
    uz: "Avval target tanlang",
  },
  "queries.calls": { ko: "호출 수", en: "Calls", uz: "Chaqiruvlar" },
  "queries.meanTime": { ko: "평균 시간", en: "Mean time", uz: "O'rtacha vaqt" },
  "queries.maxTime": { ko: "최대 시간", en: "Max time", uz: "Maksimal vaqt" },
  "queries.stdDev": { ko: "표준편차", en: "Std dev", uz: "Standart og'ish" },
  "queries.totalTime": { ko: "총 시간", en: "Total time", uz: "Umumiy vaqt" },
  "queries.rowsPerCall": {
    ko: "호출당 행 수",
    en: "Rows/call",
    uz: "Qator/chaqiruv",
  },
  "queries.cacheHit": { ko: "캐시 히트", en: "Cache hit", uz: "Cache hit" },
  "queries.detailTitle": {
    ko: "쿼리 상세",
    en: "Query Details",
    uz: "So'rov tafsilotlari",
  },
  "queries.normalized": {
    ko: "쿼리 (정규화됨)",
    en: "Query (normalized)",
    uz: "So'rov (normallashtirilgan)",
  },
  "queries.queryId": { ko: "쿼리 ID", en: "Query ID", uz: "So'rov ID" },
  "queries.explainFailed": {
    ko: "EXPLAIN 실행 실패",
    en: "EXPLAIN failed",
    uz: "EXPLAIN bajarilmadi",
  },
  "queries.explainInputLabel": {
    ko: "분석할 SELECT 쿼리",
    en: "SELECT query to analyze",
    uz: "Tahlil qilinadigan SELECT so'rov",
  },
  "queries.explainOnlySelect": {
    ko: "SELECT / WITH만 지원합니다",
    en: "Only SELECT / WITH supported",
    uz: "Faqat SELECT / WITH qo'llab-quvvatlanadi",
  },
  "queries.runExplain": {
    ko: "EXPLAIN ANALYZE 실행",
    en: "Run EXPLAIN ANALYZE",
    uz: "EXPLAIN ANALYZE ishga tushirish",
  },
  "queries.executionTime": {
    ko: "실행 시간",
    en: "Execution time",
    uz: "Bajarilish vaqti",
  },
  "queries.planJson": {
    ko: "실행 계획 (JSON)",
    en: "Query plan (JSON)",
    uz: "So'rov rejasi (JSON)",
  },
  "queries.tag.slow": { ko: "느림", en: "Slow", uz: "Sekin" },
  "queries.tag.verySlow": {
    ko: "매우 느림",
    en: "Very slow",
    uz: "Juda sekin",
  },
  "queries.tag.inconsistent": {
    ko: "편차 큼",
    en: "Inconsistent",
    uz: "Beqaror",
  },
  "queries.tag.lowCache": {
    ko: "낮은 캐시",
    en: "Low cache",
    uz: "Past cache",
  },
  "queries.tag.highRows": {
    ko: "많은 행",
    en: "High rows",
    uz: "Ko'p qatorlar",
  },
  "queries.tag.frequent": { ko: "빈번", en: "Frequent", uz: "Tez-tez" },
  "queries.tag.writeHeavy": {
    ko: "쓰기 집중",
    en: "Write heavy",
    uz: "Ko'p yozish",
  },
} satisfies Dictionary;
