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
} satisfies Dictionary;
