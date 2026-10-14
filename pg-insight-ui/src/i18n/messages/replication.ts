import type { Dictionary } from "../locales";

export const replication = {
  "replication.subtitle": {
    ko: "스트리밍 복제 및 WAL 상태",
    en: "Streaming replication & WAL health",
    uz: "Streaming replikatsiya va WAL holati",
  },
  "replication.primary": { ko: "프라이머리", en: "PRIMARY", uz: "PRIMARY" },
  "replication.replica": { ko: "레플리카", en: "REPLICA", uz: "REPLIKA" },
  "replication.replicaLagging": {
    ko: "레플리카 복제 지연",
    en: "Replica lagging",
    uz: "Replika ortda qolmoqda",
  },
  "replication.inactiveSlotsRetainingWal": {
    ko: "비활성 슬롯이 WAL을 보유 중",
    en: "Inactive slots retaining WAL",
    uz: "Nofaol slotlar WAL'ni ushlab turibdi",
  },
  "replication.replicas": { ko: "레플리카", en: "Replicas", uz: "Replikalar" },
  "replication.maxLag": {
    ko: "최대 복제 지연",
    en: "Max lag",
    uz: "Maksimal kechikish",
  },
  "replication.walSize": { ko: "WAL 크기", en: "WAL size", uz: "WAL hajmi" },
  "replication.slotsWalRetained": {
    ko: "슬롯 (보유 WAL)",
    en: "Slots (WAL retained)",
    uz: "Slotlar (saqlangan WAL)",
  },
  "replication.lagTrend": {
    ko: "복제 지연 추이 (6시간)",
    en: "Replication lag trend (6h)",
    uz: "Replikatsiya kechikishi trendi (6 soat)",
  },
  "replication.lag": { ko: "지연", en: "Lag", uz: "Kechikish" },
  "replication.connectedReplicas": {
    ko: "연결된 레플리카",
    en: "Connected replicas",
    uz: "Ulangan replikalar",
  },
  "replication.walReceiver": {
    ko: "WAL Receiver (이 서버는 레플리카입니다)",
    en: "WAL Receiver (this is a replica)",
    uz: "WAL Receiver (bu replika)",
  },
  "replication.statusLabel": { ko: "상태:", en: "Status:", uz: "Holat:" },
  "replication.latencyLabel": {
    ko: "지연 시간:",
    en: "Latency:",
    uz: "Kechikish:",
  },
  "replication.receivedLsnLabel": {
    ko: "수신 LSN:",
    en: "Received LSN:",
    uz: "Qabul qilingan LSN:",
  },
  "replication.noReplicas": {
    ko: "연결된 레플리카가 없습니다",
    en: "No replicas connected",
    uz: "Ulangan replika yo'q",
  },
  "replication.noReplicasMessage": {
    ko: "스트리밍 레플리카가 연결되면 여기에 자동으로 표시됩니다",
    en: "Streaming replicas will appear here automatically",
    uz: "Streaming replikalar shu yerda avtomatik ko'rinadi",
  },
  "replication.slots": {
    ko: "복제 슬롯",
    en: "Replication slots",
    uz: "Replikatsiya slotlari",
  },
  "replication.slotsSubtitle": {
    ko: "비활성 슬롯은 WAL을 계속 보유하여 디스크를 가득 채울 수 있습니다",
    en: "Inactive slots retain WAL and can fill the disk",
    uz: "Nofaol slotlar WAL'ni saqlab qoladi va diskni to'ldirishi mumkin",
  },
  "replication.noSlots": {
    ko: "복제 슬롯이 없습니다",
    en: "No replication slots",
    uz: "Replikatsiya slotlari yo'q",
  },
  "replication.colSlot": { ko: "슬롯", en: "Slot", uz: "Slot" },
  "replication.colStatus": { ko: "상태", en: "Status", uz: "Holat" },
  "replication.colWalRetained": {
    ko: "보유 WAL",
    en: "WAL retained",
    uz: "Saqlangan WAL",
  },
  "replication.slotActive": { ko: "활성", en: "active", uz: "faol" },
  "replication.slotInactive": { ko: "비활성", en: "inactive", uz: "nofaol" },
  "replication.writeLag": {
    ko: "Write 지연",
    en: "Write lag",
    uz: "Write kechikishi",
  },
  "replication.flushLag": {
    ko: "Flush 지연",
    en: "Flush lag",
    uz: "Flush kechikishi",
  },
  "replication.replayLag": {
    ko: "Replay 지연",
    en: "Replay lag",
    uz: "Replay kechikishi",
  },
  "replication.totalLag": {
    ko: "총 지연:",
    en: "Total lag:",
    uz: "Umumiy kechikish:",
  },
  "replication.lastReply": {
    ko: "마지막 응답: {time}",
    en: "Last reply: {time}",
    uz: "Oxirgi javob: {time}",
  },
  "replication.syncTitle": {
    ko: "동기 복제",
    en: "Synchronous replication",
    uz: "Sinxron replikatsiya",
  },
  "replication.syncSubtitle": {
    ko: "커밋이 기다리는 standby 정족수",
    en: "Standby quorum that commits wait for",
    uz: "Commit'lar kutadigan standby kvorumi",
  },
  "replication.syncSatisfied": {
    ko: "정족수 충족",
    en: "Quorum met",
    uz: "Kvorum bor",
  },
  "replication.syncBlocked": {
    ko: "커밋 대기 중",
    en: "Commits blocked",
    uz: "Commit'lar kutmoqda",
  },
  "replication.syncAsync": { ko: "비동기", en: "Asynchronous", uz: "Asinxron" },
  "replication.syncHealthy": {
    ko: "응답 중인 동기 standby / 필요 수",
    en: "Responding sync standbys / required",
    uz: "Javob berayotgan sinxron standby / kerakli",
  },
  "replication.syncBlockedHint": {
    ko: "필요한 수의 동기 standby가 응답하지 않아 새 커밋이 확인 응답을 받지 못하고 기다립니다.",
    en: "Not enough synchronous standbys are responding, so new commits wait without being acknowledged.",
    uz: "Yetarli sinxron standby javob bermayapti, shuning uchun yangi commit'lar tasdiqlanmay kutib qoladi.",
  },
  "replication.syncAsyncHint": {
    ko: "synchronous_standby_names가 비어 있습니다. 장애 시 확인 응답한 커밋이 유실될 수 있습니다.",
    en: "synchronous_standby_names is empty. Acknowledged commits can be lost on failover.",
    uz: "synchronous_standby_names bo'sh. Failover'da tasdiqlangan commit'lar yo'qolishi mumkin.",
  },
  "replication.standbyTitle": {
    ko: "Standby 재생 상태",
    en: "Standby replay",
    uz: "Standby replay holati",
  },
  "replication.standbySubtitle": {
    ko: "받은 WAL과 적용한 WAL의 차이",
    en: "Gap between received and applied WAL",
    uz: "Qabul qilingan va qo'llangan WAL farqi",
  },
  "replication.replayPaused": {
    ko: "재생 일시 정지",
    en: "Replay paused",
    uz: "Replay pauzada",
  },
  "replication.receiverMissing": {
    ko: "receiver 없음",
    en: "no receiver",
    uz: "receiver yo'q",
  },
  "replication.upstream": { ko: "업스트림", en: "Upstream", uz: "Upstream" },
  "replication.receiveLsn": {
    ko: "받은 LSN",
    en: "Received LSN",
    uz: "Qabul qilingan LSN",
  },
  "replication.replayLsn": {
    ko: "적용한 LSN",
    en: "Replayed LSN",
    uz: "Qo'llangan LSN",
  },
  "replication.replayGap": {
    ko: "적용 대기 WAL",
    en: "WAL waiting to be applied",
    uz: "Qo'llanishini kutayotgan WAL",
  },
  "replication.lastReplayedTx": {
    ko: "마지막으로 적용한 트랜잭션",
    en: "Last replayed transaction",
    uz: "Oxirgi qo'llangan tranzaksiya",
  },
  "replication.archiveTitle": {
    ko: "WAL 아카이빙",
    en: "WAL archiving",
    uz: "WAL arxivlash",
  },
  "replication.archiveSubtitle": {
    ko: "PITR이 가능하려면 끊기지 않아야 합니다",
    en: "Must stay unbroken for point-in-time recovery",
    uz: "PITR uchun uzilmasligi kerak",
  },
  "replication.archiveOk": { ko: "정상", en: "Healthy", uz: "Sog'lom" },
  "replication.archiveFailing": {
    ko: "실패 중",
    en: "Failing",
    uz: "Ishlamayapti",
  },
  "replication.archiveOff": {
    ko: "꺼짐 ({mode})",
    en: "Off ({mode})",
    uz: "O'chiq ({mode})",
  },
  "replication.archiveOnPrimary": {
    ko: "primary가 담당",
    en: "Done by the primary",
    uz: "Primary bajaradi",
  },
  "replication.archivedCount": {
    ko: "아카이브된 세그먼트",
    en: "Archived segments",
    uz: "Arxivlangan segmentlar",
  },
  "replication.lastArchived": {
    ko: "마지막 아카이브",
    en: "Last archived",
    uz: "Oxirgi arxivlangan",
  },
  "replication.archiveFailed": {
    ko: "실패 횟수",
    en: "Failures",
    uz: "Xatolar soni",
  },
  "replication.archiveReady": {
    ko: "아카이브 대기 (.ready)",
    en: "Waiting to archive (.ready)",
    uz: "Arxivlanishini kutmoqda (.ready)",
  },
  "replication.archiveReadyUnknown": {
    ko: "pg_monitor 권한 필요",
    en: "needs pg_monitor",
    uz: "pg_monitor kerak",
  },
} satisfies Dictionary;
