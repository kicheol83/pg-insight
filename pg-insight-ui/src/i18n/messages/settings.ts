import type { Dictionary } from "../locales";

export const settings = {
  "settings.title": {
    ko: "설정 및 시스템",
    en: "Settings & System",
    uz: "Sozlamalar va tizim",
  },
  "settings.subtitle": {
    ko: "서버 구성, 데이터베이스, 확장",
    en: "Server configuration, databases and extensions",
    uz: "Server konfiguratsiyasi, ma'lumotlar bazalari va kengaytmalar",
  },
  "settings.settingsCount": {
    ko: "설정 {count}개",
    en: "{count} settings",
    uz: "{count} ta sozlama",
  },
  "settings.restartPending": {
    ko: "재시작 필요",
    en: "restart pending",
    uz: "qayta ishga tushirish kutilmoqda",
  },
  "settings.moreItems": {
    ko: "+{count}개 더",
    en: "+{count} more",
    uz: "yana +{count} ta",
  },
  "settings.recommendation": {
    ko: "권장 조치:",
    en: "Recommendation:",
    uz: "Tavsiya:",
  },
  "settings.configRecommendations": {
    ko: "구성 권장 사항",
    en: "Configuration recommendations",
    uz: "Konfiguratsiya tavsiyalari",
  },
  "settings.severity.critical": { ko: "심각", en: "critical", uz: "kritik" },
  "settings.severity.warning": {
    ko: "경고",
    en: "warning",
    uz: "ogohlantirish",
  },
  "settings.severity.info": { ko: "정보", en: "info", uz: "ma'lumot" },
  "settings.recommendedValue": {
    ko: "권장값:",
    en: "recommended:",
    uz: "tavsiya etiladi:",
  },
  "settings.tabServer": { ko: "서버", en: "Server", uz: "Server" },
  "settings.tabDatabases": {
    ko: "데이터베이스",
    en: "Databases",
    uz: "Ma'lumotlar bazalari",
  },
  "settings.tabExtensions": {
    ko: "확장",
    en: "Extensions",
    uz: "Kengaytmalar",
  },
  "settings.tabSecurity": { ko: "보안", en: "Security", uz: "Xavfsizlik" },
  "settings.serverInfo": {
    ko: "서버 정보",
    en: "Server info",
    uz: "Server ma'lumotlari",
  },
  "settings.version": { ko: "버전", en: "Version", uz: "Versiya" },
  "settings.dataDirectory": {
    ko: "데이터 디렉터리",
    en: "Data directory",
    uz: "Ma'lumotlar katalogi",
  },
  "settings.timezone": { ko: "시간대", en: "Timezone", uz: "Vaqt mintaqasi" },
  "settings.encoding": { ko: "인코딩", en: "Encoding", uz: "Kodlash" },
  "settings.maxConnections": {
    ko: "최대 커넥션",
    en: "Max connections",
    uz: "Maksimal ulanishlar",
  },
  "settings.uptime": { ko: "가동 시간", en: "Uptime", uz: "Ishlash vaqti" },
  "settings.keySettings": {
    ko: "주요 설정",
    en: "Key settings",
    uz: "Asosiy sozlamalar",
  },
  "settings.searchPlaceholder": {
    ko: "설정 검색 (예: shared_buffers, work_mem)…",
    en: "Search settings (e.g. shared_buffers, work_mem)…",
    uz: "Sozlamalarni qidirish (masalan, shared_buffers, work_mem)…",
  },
  "settings.noSettingsMatch": {
    ko: "일치하는 설정이 없습니다",
    en: "No settings match",
    uz: "Mos sozlama topilmadi",
  },
  "settings.noDatabases": {
    ko: "데이터베이스가 없습니다",
    en: "No databases",
    uz: "Ma'lumotlar bazasi yo'q",
  },
  "settings.colOwner": { ko: "소유자", en: "Owner", uz: "Egasi" },
  "settings.colSize": { ko: "크기", en: "Size", uz: "Hajm" },
  "settings.colXidAge": { ko: "XID age", en: "XID age", uz: "XID yoshi" },
  "settings.noExtensions": {
    ko: "설치된 확장이 없습니다",
    en: "No extensions installed",
    uz: "O'rnatilgan kengaytmalar yo'q",
  },
  "settings.colExtension": { ko: "확장", en: "Extension", uz: "Kengaytma" },
  "settings.colSchema": { ko: "스키마", en: "Schema", uz: "Sxema" },
  "settings.colDescription": { ko: "설명", en: "Description", uz: "Tavsif" },
  "settings.securityNote": {
    ko: '읽기 전용 점검이며 어떤 작업도 실행하지 않습니다. 모니터링 사용자의 권한에 따라 일부 점검은 "확인 불가"로 표시될 수 있습니다.',
    en: 'Read-only — no actions are performed. Some checks may be "unavailable" depending on the monitoring user\'s privileges.',
    uz: "Faqat o'qish — hech qanday amal bajarilmaydi. Ba'zi tekshiruvlar monitoring foydalanuvchisining huquqiga qarab \"unavailable\" bo'lishi mumkin.",
  },
  "settings.recheck": {
    ko: "다시 점검",
    en: "Re-check",
    uz: "Qayta tekshirish",
  },
  "settings.securityRunning": {
    ko: "보안 점검 실행 중…",
    en: "Running security audit…",
    uz: "Xavfsizlik tekshiruvi o'tkazilmoqda…",
  },
} satisfies Dictionary;
