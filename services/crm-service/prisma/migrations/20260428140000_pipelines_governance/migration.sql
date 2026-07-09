-- Align with Prisma migration: governance + data quality + field history

ALTER TABLE "Pipeline" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'sales';
ALTER TABLE "Pipeline" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Pipeline" ADD COLUMN IF NOT EXISTS "ownedBy" TEXT;

ALTER TABLE "Stage" ADD COLUMN IF NOT EXISTS "isWon" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Stage" ADD COLUMN IF NOT EXISTS "isLost" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "closeReason" TEXT;
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "dataQualityScore" INTEGER;

ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "dataQualityScore" INTEGER;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "dataQualityScore" INTEGER;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "dataQualityScore" INTEGER;

CREATE TABLE IF NOT EXISTS "FieldChangeLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedBy" TEXT NOT NULL,
    "changedByName" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FieldChangeLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FieldChangeLog_tenantId_objectType_objectId_idx" ON "FieldChangeLog"("tenantId", "objectType", "objectId");
CREATE INDEX IF NOT EXISTS "FieldChangeLog_tenantId_changedAt_idx" ON "FieldChangeLog"("tenantId", "changedAt");

CREATE TABLE IF NOT EXISTS "WinLossReason" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pipelineId" TEXT,
    "type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WinLossReason_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WinLossReason_tenantId_type_idx" ON "WinLossReason"("tenantId", "type");
DO $$ BEGIN
  ALTER TABLE "WinLossReason" ADD CONSTRAINT "WinLossReason_pipelineId_fkey"
    FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "FieldPermission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "allowedRoles" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FieldPermission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FieldPermission_tenantId_objectType_fieldName_key"
  ON "FieldPermission"("tenantId", "objectType", "fieldName");
CREATE INDEX IF NOT EXISTS "FieldPermission_tenantId_objectType_idx" ON "FieldPermission"("tenantId", "objectType");

CREATE TABLE IF NOT EXISTS "ValidationRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "condition" JSONB NOT NULL,
    "requirement" JSONB NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ValidationRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ValidationRule_tenantId_objectType_idx" ON "ValidationRule"("tenantId", "objectType");
