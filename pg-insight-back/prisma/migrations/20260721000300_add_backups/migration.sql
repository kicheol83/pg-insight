CREATE TABLE "backups" (
    "id"                TEXT NOT NULL,
    "targetId"          TEXT NOT NULL,
    "status"            TEXT NOT NULL DEFAULT 'running',
    "format"            TEXT NOT NULL DEFAULT 'custom',
    "filePath"          TEXT,
    "fileSizeBytes"     BIGINT,
    "errorMessage"      TEXT,
    "startedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt"       TIMESTAMP(3),
    "triggeredByUserId" TEXT,

    CONSTRAINT "backups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "backups_targetId_startedAt_idx" ON "backups"("targetId", "startedAt");

ALTER TABLE "backups" ADD CONSTRAINT "backups_targetId_fkey"
    FOREIGN KEY ("targetId") REFERENCES "targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "backups" ADD CONSTRAINT "backups_triggeredByUserId_fkey"
    FOREIGN KEY ("triggeredByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;