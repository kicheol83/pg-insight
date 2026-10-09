import type { Dictionary } from "../locales";

export const diagnostics = {
  "diagnostics.howToFix": {
    ko: "✕ 해결 방법:",
    en: "✕ How to fix this:",
    uz: "✕ Bu muammoni qanday tuzatish mumkin:",
  },
  "diagnostics.recommendation": {
    ko: "⚠ 권장 사항:",
    en: "⚠ Recommendation:",
    uz: "⚠ Tavsiya:",
  },
  "diagnostics.noIssue": {
    ko: "문제가 없습니다",
    en: "No issues found",
    uz: "Muammo topilmadi",
  },
  "diagnostics.grade.excellent": { ko: "우수", en: "Excellent", uz: "A'lo" },
  "diagnostics.grade.good": { ko: "양호", en: "Good", uz: "Yaxshi" },
  "diagnostics.grade.fair": { ko: "보통", en: "Fair", uz: "O'rtacha" },
  "diagnostics.grade.poor": { ko: "미흡", en: "Poor", uz: "Yomon" },
  "diagnostics.healthScore": {
    ko: "헬스 스코어",
    en: "Health Score",
    uz: "Health Score",
  },
  "diagnostics.healthScoreSubtitle": {
    ko: "데이터베이스 운영 상태 — bloat, XID, 캐시, 복제, 백업",
    en: "Database operational health — bloat, XID, cache, replication, backup",
    uz: "Database operatsion holati — bloat, XID, cache, replication, backup",
  },
  "diagnostics.calculating": {
    ko: "계산 중…",
    en: "Calculating…",
    uz: "Hisoblanmoqda…",
  },
  "diagnostics.factorsAffecting": {
    ko: "{count}개 항목이 점수에 영향을 주고 있습니다",
    en: "{count} factors affecting the score",
    uz: "{count} ta omil ballga ta'sir qilmoqda",
  },
  "diagnostics.subtitleNoTarget": {
    ko: "모니터링 대상 연결 상태 점검",
    en: "Check target connection status",
    uz: "Target ulanish holatini tekshirish",
  },
  "diagnostics.noTargetTitle": {
    ko: "선택된 대상이 없습니다",
    en: "No target selected",
    uz: "Target tanlanmagan",
  },
  "diagnostics.noTargetMessage": {
    ko: "진단을 실행하려면 먼저 PostgreSQL 모니터링 대상을 추가하거나 선택하세요.",
    en: "Add or select a PostgreSQL target to run diagnostics.",
    uz: "Diagnostika o'tkazish uchun avval PostgreSQL target qo'shing yoki tanlang.",
  },
  "diagnostics.checkedJustNow": {
    ko: "방금 점검됨",
    en: "Checked just now",
    uz: "Tekshirildi: hozirgina",
  },
  "diagnostics.subtitle": {
    ko: "대상 상태 점검",
    en: "Check target status",
    uz: "Target holatini tekshirish",
  },
  "diagnostics.recheck": {
    ko: "다시 점검",
    en: "Re-check",
    uz: "Qayta tekshirish",
  },
  "diagnostics.checking": {
    ko: "대상을 점검하는 중…",
    en: "Checking target…",
    uz: "Target tekshirilmoqda…",
  },
  "diagnostics.noResult": {
    ko: "점검 결과가 없습니다",
    en: "No check results",
    uz: "Tekshiruv natijasi yo'q",
  },
  "diagnostics.healthy": {
    ko: "모두 정상 — 대상이 완전히 동작합니다",
    en: "All good — the target is fully operational",
    uz: "Hammasi joyida — target to'liq ishlaydi",
  },
  "diagnostics.degraded": {
    ko: "동작 중이지만 일부 페이지가 제한됩니다",
    en: "Working, but some pages are limited",
    uz: "Ishlayapti, lekin ba'zi sahifalar cheklangan",
  },
  "diagnostics.broken": {
    ko: "연결에 심각한 문제가 있습니다",
    en: "There is a serious connection problem",
    uz: "Ulanishda jiddiy muammo bor",
  },
  "diagnostics.errorCount": {
    ko: "오류 {count}개",
    en: "{count} errors",
    uz: "{count} ta xato",
  },
  "diagnostics.warningCount": {
    ko: "경고 {count}개",
    en: "{count} warnings",
    uz: "{count} ta ogohlantirish",
  },
  "diagnostics.allPassed": {
    ko: "모든 점검을 통과했습니다",
    en: "All checks passed",
    uz: "Barcha tekshiruvlar muvaffaqiyatli",
  },
  "diagnostics.goToDashboard": {
    ko: "대시보드로 이동",
    en: "Go to Dashboard",
    uz: "Dashboard'ga o'tish",
  },
  "diagnostics.fixHint": {
    ko: '위 오류를 해결한 후 "다시 점검" 버튼을 누르세요. 문제가 해결되면 계속 진행 버튼이 나타납니다.',
    en: 'After fixing the errors above, click "Re-check" — once the problems are resolved, the continue button will appear.',
    uz: "Yuqoridagi xatolarni tuzatgach, \"Qayta tekshirish\" tugmasini bosing — muammo yo'qolgach, davom etish tugmasi paydo bo'ladi.",
  },
} satisfies Dictionary;
