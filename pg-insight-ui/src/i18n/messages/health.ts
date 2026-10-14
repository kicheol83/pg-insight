import type { Dictionary } from "../locales";

export const health = {
  "health.xid_age.label": {
    ko: "트랜잭션 ID wraparound",
    en: "Transaction ID wraparound",
    uz: "Tranzaksiya ID wraparound",
  },
  "health.xid_age.emergency": {
    ko: "XID {xid} · MultiXact {mxid} — 즉시 VACUUM FREEZE가 필요합니다",
    en: "XID {xid} · MultiXact {mxid} — run VACUUM FREEZE now",
    uz: "XID {xid} · MultiXact {mxid} — darhol VACUUM FREEZE kerak",
  },
  "health.xid_age.risk": {
    ko: "XID {xid} · MultiXact {mxid} — 5억을 넘었습니다",
    en: "XID {xid} · MultiXact {mxid} — above 500 million",
    uz: "XID {xid} · MultiXact {mxid} — 500 milliondan oshgan",
  },
  "health.xid_age.ok": {
    ko: "XID {xid} · MultiXact {mxid}",
    en: "XID {xid} · MultiXact {mxid}",
    uz: "XID {xid} · MultiXact {mxid}",
  },
  "health.bloat.label": {
    ko: "테이블 bloat",
    en: "Table bloat",
    uz: "Jadval bloat",
  },
  "health.bloat.high": {
    ko: "최대 {pct}% · VACUUM 대기 테이블 {count}개",
    en: "Up to {pct}% · {count} tables waiting for VACUUM",
    uz: "Eng yuqori {pct}% · {count} ta jadval VACUUM kutmoqda",
  },
  "health.bloat.pending": {
    ko: "VACUUM 대기 테이블 {count}개",
    en: "{count} tables waiting for VACUUM",
    uz: "{count} ta jadval VACUUM kutmoqda",
  },
  "health.cache_hit.label": {
    ko: "버퍼 캐시 적중률",
    en: "Buffer cache hit ratio",
    uz: "Buffer cache hit ratio",
  },
  "health.cache_hit.low": {
    ko: "평균 {pct}% — shared_buffers가 부족할 수 있습니다",
    en: "Average {pct}% — shared_buffers may be too small",
    uz: "O'rtacha {pct}% — shared_buffers yetarli emas bo'lishi mumkin",
  },
  "health.cache_hit.warn": {
    ko: "평균 {pct}%",
    en: "Average {pct}%",
    uz: "O'rtacha {pct}%",
  },
  "health.replication_lag.label": {
    ko: "복제 지연",
    en: "Replication lag",
    uz: "Replikatsiya kechikishi",
  },
  "health.replication_lag.lagging": {
    ko: "최대 지연 {mb} MB",
    en: "Max lag {mb} MB",
    uz: "Maksimal kechikish {mb} MB",
  },
  "health.connection_pool.label": {
    ko: "연결 사용률",
    en: "Connection usage",
    uz: "Ulanishlar bandligi",
  },
  "health.connection_pool.full": {
    ko: "{pct}% 사용 중 — 새 연결이 거부될 수 있습니다",
    en: "{pct}% in use — new connections may be refused",
    uz: "{pct}% band — yangi ulanishlar rad etilishi mumkin",
  },
  "health.connection_pool.high": {
    ko: "{pct}% 사용 중",
    en: "{pct}% in use",
    uz: "{pct}% band",
  },
  "health.backup_freshness.label": {
    ko: "백업 최신성",
    en: "Backup freshness",
    uz: "Backup yangiligi",
  },
  "health.backup_freshness.never": {
    ko: "성공한 백업이 없습니다",
    en: "No successful backup yet",
    uz: "Hech qachon muvaffaqiyatli backup olinmagan",
  },
  "health.backup_freshness.days": {
    ko: "마지막 백업 {days}일 전",
    en: "Last backup {days} days ago",
    uz: "Oxirgi backup {days} kun oldin",
  },
  "health.backup_freshness.hours": {
    ko: "마지막 백업 {hours}시간 전",
    en: "Last backup {hours} hours ago",
    uz: "Oxirgi backup {hours} soat oldin",
  },
  "health.sync_quorum.label": {
    ko: "동기 standby 정족수",
    en: "Synchronous standby quorum",
    uz: "Sinxron standby kvorumi",
  },
  "health.sync_quorum.ok": {
    ko: "응답 중 {healthy} / 필요 {required}",
    en: "{healthy} responding / {required} required",
    uz: "{healthy} ta javob bermoqda / {required} ta kerak",
  },
  "health.sync_quorum.unsatisfied": {
    ko: "{names}: 응답 {healthy} / 필요 {required} — 커밋이 대기합니다",
    en: "{names}: {healthy} of {required} responding — commits are waiting",
    uz: "{names}: {required} tadan {healthy} tasi javob bermoqda — commit'lar kutmoqda",
  },
  "health.replication_slots.label": {
    ko: "복제 슬롯",
    en: "Replication slots",
    uz: "Replication slotlar",
  },
  "health.replication_slots.lost": {
    ko: "{slot} 슬롯이 필요한 WAL을 잃었습니다 — standby를 다시 만들어야 합니다",
    en: "Slot {slot} lost required WAL — the standby must be rebuilt",
    uz: "{slot} slot'i kerakli WAL'ni yo'qotgan — standby qayta qurilishi kerak",
  },
  "health.replication_slots.retaining": {
    ko: "비활성 슬롯 {slot}이 WAL {mb} MB를 붙잡고 있습니다",
    en: "Inactive slot {slot} retains {mb} MB of WAL",
    uz: "Nofaol {slot} slot'i {mb} MB WAL ushlab turibdi",
  },
  "health.replication_slots.ok": {
    ko: "슬롯 {count}개 정상",
    en: "{count} slots healthy",
    uz: "{count} ta slot sog'lom",
  },
  "health.standby_replay.label": {
    ko: "Standby 복제",
    en: "Standby replication",
    uz: "Standby replikatsiyasi",
  },
  "health.standby_replay.receiverDown": {
    ko: "WAL receiver 상태: {status}",
    en: "WAL receiver status: {status}",
    uz: "WAL receiver holati: {status}",
  },
  "health.standby_replay.paused": {
    ko: "WAL 재생이 일시 정지되어 있습니다",
    en: "WAL replay is paused",
    uz: "WAL replay pauza qilingan",
  },
  "health.standby_replay.replayBehind": {
    ko: "받았지만 적용하지 못한 WAL {mb} MB",
    en: "{mb} MB of WAL received but not applied",
    uz: "Qabul qilingan, lekin qo'llanmagan WAL: {mb} MB",
  },
  "health.standby_replay.streaming": {
    ko: "{host}에서 스트리밍 중",
    en: "Streaming from {host}",
    uz: "{host} dan streaming",
  },
  "health.wal_archiving.label": {
    ko: "WAL 아카이빙",
    en: "WAL archiving",
    uz: "WAL arxivlash",
  },
  "health.wal_archiving.failing": {
    ko: "archive_command 실패 중 ({failed}회, 마지막 {wal}) — PITR 체인이 끊겼습니다",
    en: "archive_command is failing ({failed} times, last {wal}) — the PITR chain is broken",
    uz: "archive_command ishlamayapti ({failed} marta, oxirgisi {wal}) — PITR zanjiri uzilgan",
  },
  "health.wal_archiving.backlog": {
    ko: "아카이브 대기 세그먼트 {ready}개",
    en: "{ready} segments waiting to be archived",
    uz: "{ready} ta segment arxivlanishini kutmoqda",
  },
  "health.wal_archiving.ok": {
    ko: "마지막 아카이브 {wal}",
    en: "Last archived {wal}",
    uz: "Oxirgi arxivlangan {wal}",
  },
  "health.wal_archiving.off": {
    ko: "archive_mode가 꺼져 있어 PITR을 할 수 없습니다",
    en: "archive_mode is off, so point-in-time recovery is not possible",
    uz: "archive_mode o'chiq — PITR imkoni yo'q",
  },
} satisfies Dictionary;
