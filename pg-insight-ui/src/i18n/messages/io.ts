import type { Dictionary } from "../locales";

export const io = {
  "io.backend.clientBackend": {
    ko: "클라이언트 백엔드",
    en: "Client backend",
    uz: "Mijoz ulanishi",
  },
  "io.backend.autovacuumWorker": {
    ko: "Autovacuum",
    en: "Autovacuum",
    uz: "Autovacuum",
  },
  "io.backend.autovacuumLauncher": {
    ko: "Autovacuum launcher",
    en: "Autovacuum launcher",
    uz: "Autovacuum launcher",
  },
  "io.backend.backgroundWriter": {
    ko: "Background writer",
    en: "Background writer",
    uz: "Background writer",
  },
  "io.backend.checkpointer": {
    ko: "Checkpointer",
    en: "Checkpointer",
    uz: "Checkpointer",
  },
  "io.backend.walWriter": {
    ko: "WAL writer",
    en: "WAL writer",
    uz: "WAL writer",
  },
  "io.backend.standalone": {
    ko: "단독 실행 (VACUUM)",
    en: "Standalone (VACUUM)",
    uz: "Standalone (VACUUM)",
  },
  "io.subtitle": {
    ko: "디스크 I/O — pg_stat_io",
    en: "Disk operations — pg_stat_io",
    uz: "Disk operatsiyalari — pg_stat_io",
  },
  "io.noTarget": {
    ko: "모니터링 대상이 선택되지 않았습니다",
    en: "No target selected",
    uz: "Target tanlanmagan",
  },
  "io.updatedJustNow": {
    ko: "방금 업데이트됨",
    en: "Updated just now",
    uz: "Yangilandi hozirgina",
  },
  "io.pgStatIoFull": {
    ko: "pg_stat_io (전체)",
    en: "pg_stat_io (full)",
    uz: "pg_stat_io (to'liq)",
  },
  "io.simplifiedView": {
    ko: "간소화된 보기",
    en: "Simplified view",
    uz: "Soddalashtirilgan ko'rinish",
  },
  "io.trackIoTimingOff": {
    ko: "track_io_timing 비활성화",
    en: "track_io_timing is off",
    uz: "track_io_timing o'chirilgan",
  },
  "io.oldServerBefore": {
    ko: "이 서버는 PostgreSQL 16 미만이므로 상세",
    en: "This server is older than PostgreSQL 16 — detailed",
    uz: "Bu server PostgreSQL 16'dan eski — batafsil",
  },
  "io.oldServerAfter": {
    ko: "뷰를 사용할 수 없습니다",
    en: "is not available",
    uz: "mavjud emas",
  },
  "io.fallbackBefore": {
    ko: "아래는",
    en: "Below is a simplified view based on",
    uz: "Quyida",
  },
  "io.fallbackAfter": {
    ko: "기반의 간소화된 보기입니다 — backend 유형별로 나뉘지 않으며 테이블/인덱스 캐시 통계만 제공합니다. 상세 보기를 원하면 PostgreSQL 16 이상으로 업그레이드하세요.",
    en: "— not broken down by backend type, only table/index cache statistics. Upgrade to PostgreSQL 16+ for the detailed view.",
    uz: "asosidagi soddalashtirilgan ko'rinish ko'rsatilmoqda — backend turi bo'yicha ajratilmagan, faqat jadval/indeks cache statistikasi. Batafsil ko'rish uchun PostgreSQL 16+ ga o'ting.",
  },
  "io.byBackendTitle": {
    ko: "backend 유형별 I/O 부하",
    en: "I/O load by backend type",
    uz: "Backend turi bo'yicha I/O yuki",
  },
  "io.byBackendSubtitle": {
    ko: "디스크를 가장 많이 사용하는 주체",
    en: "Who is keeping the disk busiest",
    uz: "Kim disk'ni ko'proq band qilyapti",
  },
  "io.noActivity": {
    ko: "I/O 활동이 없습니다",
    en: "No I/O activity found",
    uz: "I/O faoliyati topilmadi",
  },
  "io.noActivityMessage": {
    ko: "아직 기록된 디스크 작업이 없습니다",
    en: "No disk operations have been recorded yet",
    uz: "Hozircha hech qanday disk operatsiyasi qayd etilmagan",
  },
  "io.detailTitle": {
    ko: "상세 I/O 테이블",
    en: "Detailed I/O table",
    uz: "Batafsil I/O jadvali",
  },
  "io.detailSubtitle": {
    ko: "backend, 객체, 컨텍스트별",
    en: "By backend, object and context",
    uz: "Backend, obyekt va kontekst bo'yicha",
  },
  "io.colBackend": { ko: "백엔드", en: "Backend", uz: "Backend" },
  "io.colObject": { ko: "객체", en: "Object", uz: "Obyekt" },
  "io.colContext": { ko: "컨텍스트", en: "Context", uz: "Kontekst" },
  "io.colReads": { ko: "읽기", en: "Reads", uz: "O'qishlar" },
  "io.colWrites": { ko: "쓰기", en: "Writes", uz: "Yozishlar" },
  "io.colExtends": { ko: "확장", en: "Extends", uz: "Kengaytirishlar" },
  "io.colHits": { ko: "적중", en: "Hits", uz: "Hit'lar" },
  "io.colEvictions": {
    ko: "축출",
    en: "Evictions",
    uz: "Chiqarib yuborishlar",
  },
  "io.colTime": {
    ko: "시간 (읽기/쓰기)",
    en: "Time (read/write)",
    uz: "Vaqt (o'qish/yozish)",
  },
  "io.fallbackTitle": {
    ko: "테이블/인덱스 캐시 통계",
    en: "Table/index cache statistics",
    uz: "Jadval/indeks cache statistikasi",
  },
  "io.heap": {
    ko: "Heap (테이블 데이터)",
    en: "Heap (table data)",
    uz: "Heap (jadval ma'lumoti)",
  },
  "io.readFromDisk": {
    ko: "읽음 (디스크)",
    en: "Read (from disk)",
    uz: "O'qilgan (disk'dan)",
  },
  "io.hitFromCache": {
    ko: "적중 (캐시)",
    en: "Hit (from cache)",
    uz: "Hit (cache'dan)",
  },
  "io.index": { ko: "인덱스", en: "Index", uz: "Indeks" },
  "io.overallCacheHit": {
    ko: "전체 캐시 적중률",
    en: "Overall cache hit ratio",
    uz: "Umumiy cache hit ratio",
  },
} satisfies Dictionary;
