import type { Dictionary } from "../locales";

export const tables = {
  "tables.subtitle": {
    ko: "블로트, 스캔, 인덱스 상태",
    en: "Bloat, scans, and index health",
    uz: "Bloat, skanlar va indekslar holati",
  },
  "tables.searchPlaceholder": {
    ko: "테이블 및 인덱스 검색…",
    en: "Search tables & indexes…",
    uz: "Jadval va indekslarni qidirish…",
  },
  "tables.tableSize": {
    ko: "테이블 크기",
    en: "Table size",
    uz: "Jadvallar hajmi",
  },
  "tables.indexSize": {
    ko: "인덱스 크기",
    en: "Index size",
    uz: "Indekslar hajmi",
  },
  "tables.needVacuum": {
    ko: "VACUUM 필요",
    en: "Need vacuum",
    uz: "Vacuum kerak",
  },
  "tables.unusedIndexes": {
    ko: "미사용 인덱스",
    en: "Unused indexes",
    uz: "Ishlatilmayotgan indekslar",
  },
  "tables.wasted": {
    ko: "{size} 낭비",
    en: "{size} wasted",
    uz: "{size} behuda",
  },
  "tables.recommendations": {
    ko: "권장 사항",
    en: "Recommendations",
    uz: "Tavsiyalar",
  },
  "tables.recommendationsSubtitle": {
    ko: "바로 적용할 수 있는 개선 사항 — 명령어를 복사해 적용하세요",
    en: "Actionable improvements — copy the command to apply",
    uz: "Amaliy yaxshilanishlar — qo'llash uchun buyruqni nusxalang",
  },
  "tables.severity.critical": { ko: "심각", en: "critical", uz: "kritik" },
  "tables.severity.warning": {
    ko: "경고",
    en: "warning",
    uz: "ogohlantirish",
  },
  "tables.severity.info": { ko: "정보", en: "info", uz: "ma'lumot" },
  "tables.run": { ko: "실행", en: "Run", uz: "Ishga tushirish" },
  "tables.vacuumStarted": {
    ko: "VACUUM 시작됨",
    en: "VACUUM started",
    uz: "VACUUM boshlandi",
  },
  "tables.vacuumStartedMessage": {
    ko: "{name} — 진행 상황은 VACUUM 페이지에서 확인하세요",
    en: "{name} — open the Vacuum page to follow the result",
    uz: "{name} — natijani kuzatish uchun Vacuum sahifasiga o'ting",
  },
  "tables.vacuumFailed": {
    ko: "VACUUM을 시작하지 못했습니다",
    en: "Failed to start VACUUM",
    uz: "VACUUM boshlanmadi",
  },
  "tables.indexDropping": {
    ko: "인덱스 삭제 중",
    en: "Dropping index",
    uz: "Indeks o'chirilmoqda",
  },
  "tables.dropFailed": {
    ko: "삭제하지 못했습니다",
    en: "Could not delete",
    uz: "O'chirib bo'lmadi",
  },
  "tables.confirmDropTitle": {
    ko: "인덱스 삭제 확인",
    en: "Confirm index deletion",
    uz: "Indeksni o'chirishni tasdiqlang",
  },
  "tables.confirmDropYes": {
    ko: "예, 삭제합니다",
    en: "Yes, delete",
    uz: "Ha, o'chirish",
  },
  "tables.confirmDropBody": {
    ko: "인덱스가 삭제됩니다. 실행 전에 백엔드가 이 인덱스가 여전히 사용되지 않는지, 제약 조건(primary key/unique)에 속하지 않는지 다시 확인합니다.",
    en: "will be dropped. Before doing so, the backend re-checks that the index is still unused and does not belong to a constraint (primary key/unique).",
    uz: "indeksi o'chiriladi. Backend bu amalni bajarishdan oldin indeks hali ham ishlatilmayotganini va constraint'ga (primary key/unique) tegishli emasligini qayta tekshiradi.",
  },
  "tables.confirmDropWarning": {
    ko: "이 작업은 되돌릴 수 없습니다 — 인덱스가 다시 필요하면 처음부터 새로 생성해야 합니다.",
    en: "This cannot be undone — to get the index back you will have to create it again from scratch.",
    uz: "Bu amalni qaytarib bo'lmaydi — indeksni qayta yaratish uchun uni noldan yaratishga to'g'ri keladi.",
  },
  "tables.tabTables": {
    ko: "테이블 ({count})",
    en: "Tables ({count})",
    uz: "Jadvallar ({count})",
  },
  "tables.tabIndexes": {
    ko: "인덱스 ({count})",
    en: "Indexes ({count})",
    uz: "Indekslar ({count})",
  },
  "tables.noTables": {
    ko: "테이블이 없습니다",
    en: "No tables found",
    uz: "Jadval topilmadi",
  },
  "tables.noIndexes": {
    ko: "인덱스가 없습니다",
    en: "No indexes found",
    uz: "Indeks topilmadi",
  },
  "tables.colTable": { ko: "테이블", en: "Table", uz: "Jadval" },
  "tables.badgeNeedsVacuum": {
    ko: "VACUUM 필요",
    en: "needs vacuum",
    uz: "vacuum kerak",
  },
  "tables.badgeSeqScanHeavy": {
    ko: "seq scan 과다",
    en: "seq-scan heavy",
    uz: "seq-scan ko'p",
  },
  "tables.badgeAutovacuumOff": {
    ko: "autovacuum 꺼짐",
    en: "autovacuum off",
    uz: "autovacuum o'chiq",
  },
  "tables.colLiveRows": {
    ko: "live tuple",
    en: "Live rows",
    uz: "Tirik qatorlar",
  },
  "tables.colDeadRows": {
    ko: "dead tuple",
    en: "Dead rows",
    uz: "O'lik qatorlar",
  },
  "tables.colBloat": { ko: "블로트", en: "Bloat", uz: "Bloat" },
  "tables.colSeqIdxScans": {
    ko: "Seq / Idx 스캔",
    en: "Seq / Idx scans",
    uz: "Seq / Idx skanlar",
  },
  "tables.colTotalSize": {
    ko: "전체 크기",
    en: "Total size",
    uz: "Umumiy hajm",
  },
  "tables.colLastVacuum": {
    ko: "마지막 VACUUM",
    en: "Last vacuum",
    uz: "Oxirgi vacuum",
  },
  "tables.never": { ko: "없음", en: "never", uz: "hech qachon" },
  "tables.colIndex": { ko: "인덱스", en: "Index", uz: "Indeks" },
  "tables.onTable": {
    ko: "{name} 테이블",
    en: "on {name}",
    uz: "{name} jadvalida",
  },
  "tables.colType": { ko: "유형", en: "Type", uz: "Turi" },
  "tables.badgeUnused": { ko: "미사용", en: "unused", uz: "ishlatilmaydi" },
  "tables.colScans": { ko: "스캔", en: "Scans", uz: "Skanlar" },
  "tables.colSize": { ko: "크기", en: "Size", uz: "Hajm" },
  "tables.colColumns": { ko: "컬럼", en: "Columns", uz: "Ustunlar" },
} satisfies Dictionary;
