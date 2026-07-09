ALTER TABLE "OutboxMessage"
  ADD COLUMN IF NOT EXISTS "key" TEXT,
  ADD COLUMN IF NOT EXISTS "tenantId" TEXT,
  ADD COLUMN IF NOT EXISTS "aggregateType" TEXT,
  ADD COLUMN IF NOT EXISTS "eventType" TEXT,
  ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "retryCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "OutboxMessage"
SET
  "tenantId" = COALESCE("tenantId", headers->>'tenantId', payload->>'tenantId'),
  "aggregateType" = COALESCE("aggregateType", headers->>'aggregateType'),
  "eventType" = COALESCE("eventType", headers->>'eventType', payload->>'type'),
  "processedAt" = COALESCE("processedAt", "sentAt")
WHERE "tenantId" IS NULL
   OR "aggregateType" IS NULL
   OR "eventType" IS NULL
   OR ("processedAt" IS NULL AND "sentAt" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "OutboxMessage_processedAt_retryCount_createdAt_idx"
  ON "OutboxMessage"("processedAt", "retryCount", "createdAt");

CREATE INDEX IF NOT EXISTS "OutboxMessage_aggregateType_aggregateId_idx"
  ON "OutboxMessage"("aggregateType", "aggregateId");
