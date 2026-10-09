import type { Dictionary } from "../locales";

export const database = {
  "database.subtitle": {
    ko: "pg_stat_database — 데이터베이스 수준 통계",
    en: "pg_stat_database — database-wide statistics",
    uz: "pg_stat_database — butun DB darajasidagi statistika",
  },
  "database.noTarget": {
    ko: "모니터링 대상이 선택되지 않았습니다",
    en: "No target selected",
    uz: "Target tanlanmagan",
  },
  "database.updatedJustNow": {
    ko: "방금 업데이트됨",
    en: "Updated just now",
    uz: "Yangilandi hozirgina",
  },
  "database.trackIoTimingOff": {
    ko: "track_io_timing 비활성화 — I/O 시간 지표가 표시되지 않습니다",
    en: "track_io_timing is off — I/O timing is not shown",
    uz: "track_io_timing o'chirilgan — I/O vaqt o'lchamlari ko'rsatilmaydi",
  },
  "database.avgCacheHit": {
    ko: "평균 캐시 적중률",
    en: "Avg cache hit",
    uz: "O'rtacha cache hit",
  },
  "database.deadlocksTotal": {
    ko: "데드락 (합계)",
    en: "Deadlocks (total)",
    uz: "Deadlock'lar (jami)",
  },
  "database.tempFiles": {
    ko: "임시 파일",
    en: "Temp files",
    uz: "Temp fayllar",
  },
  "database.tempSize": {
    ko: "임시 파일 크기",
    en: "Temp size",
    uz: "Temp hajmi",
  },
  "database.tempWarningTitle": {
    ko: "임시 파일이 많은 공간을 차지하고 있습니다",
    en: "Temp files are taking up a lot of space",
    uz: "Temp fayllar katta hajmni egallayapti",
  },
  "database.tempWarningBefore": {
    ko: "이는 보통",
    en: "This usually means the",
    uz: "Bu odatda",
  },
  "database.tempWarningMiddle": {
    ko: "설정이 RAM 안에서 처리해야 하는 정렬 또는 해시 작업에 충분하지 않다는 뜻입니다.",
    en: "setting is too small for sort or hash operations to fit in RAM. Consider increasing",
    uz: "sozlamasi RAM'da sig'maydigan sort yoki hash operatsiyalari uchun yetarli emasligini bildiradi.",
  },
  "database.tempWarningAfter": {
    ko: "을 늘리거나 무거운 쿼리를 최적화하는 것을 검토하세요.",
    en: " or optimizing heavy queries.",
    uz: "ni oshirishni yoki og'ir so'rovlarni optimallashtirishni ko'rib chiqing.",
  },
  "database.statsReset": {
    ko: "통계 초기화: {time}",
    en: "Stats reset {time}",
    uz: "Statistika {time} dan beri",
  },
  "database.backends": {
    ko: "커넥션 {count}개",
    en: "{count} connections",
    uz: "{count} ulanish",
  },
  "database.cacheHitRatio": {
    ko: "캐시 적중률",
    en: "Cache hit ratio",
    uz: "Cache hit nisbati",
  },
  "database.deadlocks": { ko: "데드락", en: "Deadlocks", uz: "Deadlock'lar" },
  "database.conflicts": {
    ko: "충돌 (레플리카)",
    en: "Conflicts (replica)",
    uz: "Konfliktlar (replika)",
  },
  "database.tuplesReturnedFetched": {
    ko: "tuple 반환 / 페치",
    en: "Tuples returned / fetched",
    uz: "Tuple qaytarilgan / olingan",
  },
  "database.tempFilesSize": {
    ko: "임시 파일 / 크기",
    en: "Temp files / size",
    uz: "Temp fayl / hajm",
  },
  "database.checksumFailures": {
    ko: "체크섬 실패",
    en: "Checksum failures",
    uz: "Checksum xatolari",
  },
  "database.readTime": {
    ko: "읽기 시간:",
    en: "Read time:",
    uz: "O'qish vaqti:",
  },
  "database.writeTime": {
    ko: "쓰기 시간:",
    en: "Write time:",
    uz: "Yozish vaqti:",
  },
  "database.noDatabases": {
    ko: "데이터베이스를 찾을 수 없습니다",
    en: "No databases found",
    uz: "Database topilmadi",
  },
} satisfies Dictionary;
