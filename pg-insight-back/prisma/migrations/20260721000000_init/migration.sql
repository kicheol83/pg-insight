CREATE TABLE "targets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 5432,
    "database" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordEncrypted" TEXT NOT NULL,
    "sslMode" TEXT NOT NULL DEFAULT 'prefer',
    "sslCert" TEXT,
    "status" TEXT NOT NULL DEFAULT 'connecting',
    "errorMessage" TEXT,
    "lastConnectedAt" TIMESTAMP(3),
    "lastCollectedAt" TIMESTAMP(3),
    "pgVersion" TEXT,
    "pgVersionNum" INTEGER,
    "hasStatStatements" BOOLEAN NOT NULL DEFAULT false,
    "hasTimescaledb" BOOLEAN NOT NULL DEFAULT false,
    "collectionIntervalMs" INTEGER NOT NULL DEFAULT 5000,
    "slowQueryThresholdMs" INTEGER NOT NULL DEFAULT 1000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "targets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collection_logs" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "metricsCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "collection_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alert_rules" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "metric" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "cooldownMs" INTEGER NOT NULL DEFAULT 300000,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notifyChannels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alert_events" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "currentValue" DOUBLE PRECISION NOT NULL,
    "message" TEXT,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "saved_queries" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sql" TEXT NOT NULL,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "saved_queries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "collection_logs_targetId_collectedAt_idx"
ON "collection_logs"("targetId", "collectedAt");

CREATE INDEX "alert_events_targetId_triggeredAt_idx"
ON "alert_events"("targetId", "triggeredAt");

ALTER TABLE "collection_logs"
ADD CONSTRAINT "collection_logs_targetId_fkey"
FOREIGN KEY ("targetId") REFERENCES "targets"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "alert_rules"
ADD CONSTRAINT "alert_rules_targetId_fkey"
FOREIGN KEY ("targetId") REFERENCES "targets"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "alert_events"
ADD CONSTRAINT "alert_events_targetId_fkey"
FOREIGN KEY ("targetId") REFERENCES "targets"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "alert_events"
ADD CONSTRAINT "alert_events_ruleId_fkey"
FOREIGN KEY ("ruleId") REFERENCES "alert_rules"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "saved_queries"
ADD CONSTRAINT "saved_queries_targetId_fkey"
FOREIGN KEY ("targetId") REFERENCES "targets"("id")
ON DELETE CASCADE ON UPDATE CASCADE;