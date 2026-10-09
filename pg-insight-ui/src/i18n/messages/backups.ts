import type { Dictionary } from "../locales";

export const backups = {
  "backups.subtitleShort": {
    ko: "pg_dump를 이용한 논리 백업",
    en: "Logical backup via pg_dump",
    uz: "pg_dump orqali logical backup",
  },
  "backups.subtitle": {
    ko: "pg_dump를 이용한 논리 백업 — 버튼 하나로",
    en: "Logical backup via pg_dump — in one click",
    uz: "pg_dump orqali logical backup — bitta tugma bilan",
  },
  "backups.noTarget": {
    ko: "선택된 대상이 없습니다",
    en: "No target selected",
    uz: "Target tanlanmagan",
  },
  "backups.started": {
    ko: "백업이 시작되었습니다",
    en: "Backup started",
    uz: "Backup boshlandi",
  },
  "backups.startedMessage": {
    ko: "백그라운드에서 진행 중입니다 — 이 페이지는 자동으로 새로고침됩니다",
    en: "Running in the background — this page refreshes automatically",
    uz: "Jarayon fon rejimida davom etmoqda — bu sahifa avtomatik yangilanadi",
  },
  "backups.startFailed": {
    ko: "백업을 시작하지 못했습니다",
    en: "Failed to start backup",
    uz: "Backup boshlanmadi",
  },
  "backups.downloadFailed": {
    ko: "다운로드 실패",
    en: "Download failed",
    uz: "Yuklab bo'lmadi",
  },
  "backups.deleteConfirm": {
    ko: "백업을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.",
    en: "Delete this backup? This action cannot be undone.",
    uz: "Backup'ni o'chirishni tasdiqlaysizmi? Bu amalni qaytarib bo'lmaydi.",
  },
  "backups.deleted": {
    ko: "백업이 삭제되었습니다",
    en: "Backup deleted",
    uz: "Backup o'chirildi",
  },
  "backups.deleteFailed": {
    ko: "삭제 실패",
    en: "Failed to delete",
    uz: "O'chirib bo'lmadi",
  },
  "backups.start": {
    ko: "백업 시작",
    en: "Start backup",
    uz: "Backup boshlash",
  },
  "backups.running": {
    ko: "백업 진행 중…",
    en: "Backup in progress…",
    uz: "Backup ishlamoqda…",
  },
  "backups.total": {
    ko: "전체 백업",
    en: "Total backups",
    uz: "Jami backup",
  },
  "backups.successful": {
    ko: "성공",
    en: "Successful",
    uz: "Muvaffaqiyatli",
  },
  "backups.totalSize": {
    ko: "전체 용량",
    en: "Total size",
    uz: "Umumiy hajm",
  },
  "backups.diskWarningTitle": {
    ko: "백업이 디스크 공간을 많이 차지하고 있습니다",
    en: "Backups are taking up a lot of disk space",
    uz: "Backup'lar katta disk hajmini egallayapti",
  },
  "backups.diskWarningMessage": {
    ko: "필요 없는 오래된 백업을 삭제해 디스크 공간을 확보하는 것을 검토하세요. 아직 자동 보관 정책(retention policy)은 없으며, 삭제는 수동으로 진행해야 합니다.",
    en: "Consider deleting old, unneeded backups to free up disk space. There is no automatic retention policy yet — backups must be deleted manually.",
    uz: "Eski, kerak bo'lmagan backup'larni o'chirib, disk joyini bo'shatishni ko'rib chiqing. Hozircha avtomatik saqlash siyosati (retention policy) mavjud emas — o'chirish qo'lda amalga oshiriladi.",
  },
  "backups.history": {
    ko: "백업 이력",
    en: "Backup history",
    uz: "Backup tarixi",
  },
  "backups.empty": {
    ko: "아직 백업이 없습니다",
    en: "No backups yet",
    uz: "Hali backup olinmagan",
  },
  "backups.colStatus": { ko: "상태", en: "Status", uz: "Holat" },
  "backups.colStarted": { ko: "시작", en: "Started", uz: "Boshlangan" },
  "backups.colDuration": {
    ko: "소요 시간",
    en: "Duration",
    uz: "Davomiylik",
  },
  "backups.colSize": { ko: "크기", en: "Size", uz: "Hajm" },
  "backups.colError": { ko: "오류", en: "Error", uz: "Xato" },
  "backups.status.completed": {
    ko: "완료",
    en: "completed",
    uz: "yakunlangan",
  },
  "backups.status.failed": {
    ko: "실패",
    en: "failed",
    uz: "muvaffaqiyatsiz",
  },
  "backups.status.running": {
    ko: "실행 중",
    en: "running",
    uz: "bajarilmoqda",
  },
} satisfies Dictionary;
