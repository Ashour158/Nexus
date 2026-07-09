-- Admin-controlled coding engine for module reference numbers.

CREATE TABLE IF NOT EXISTS "CodingRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "pattern" TEXT NOT NULL,
    "separator" TEXT NOT NULL DEFAULT '-',
    "sequenceScope" TEXT NOT NULL DEFAULT 'TENANT',
    "resetPolicy" TEXT NOT NULL DEFAULT 'NEVER',
    "nextSequence" INTEGER NOT NULL DEFAULT 1,
    "isManualOverrideAllowed" BOOLEAN NOT NULL DEFAULT false,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "lockedAfterCreate" BOOLEAN NOT NULL DEFAULT true,
    "fallbackStrategy" TEXT NOT NULL DEFAULT 'USE_DEFAULT',
    "effectiveFrom" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CodingRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CodingRuleVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codingRuleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "pattern" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "separator" TEXT NOT NULL,
    "sequenceScope" TEXT NOT NULL,
    "resetPolicy" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CodingRuleVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CodingSequence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,
    "resetAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CodingSequence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CodingAllocationLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "allocatedBy" TEXT NOT NULL,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isManualOverride" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "CodingAllocationLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CodingRule_tenantId_entityType_isActive_effectiveFrom_key" ON "CodingRule"("tenantId", "entityType", "isActive", "effectiveFrom");
CREATE INDEX IF NOT EXISTS "CodingRule_tenantId_entityType_idx" ON "CodingRule"("tenantId", "entityType");
CREATE INDEX IF NOT EXISTS "CodingRule_tenantId_isActive_idx" ON "CodingRule"("tenantId", "isActive");
CREATE UNIQUE INDEX IF NOT EXISTS "CodingRule_id_tenantId_key" ON "CodingRule"("id", "tenantId");
CREATE INDEX IF NOT EXISTS "CodingRuleVersion_tenantId_codingRuleId_idx" ON "CodingRuleVersion"("tenantId", "codingRuleId");
CREATE UNIQUE INDEX IF NOT EXISTS "CodingRuleVersion_id_tenantId_key" ON "CodingRuleVersion"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "CodingSequence_tenantId_entityType_scopeKey_key" ON "CodingSequence"("tenantId", "entityType", "scopeKey");
CREATE INDEX IF NOT EXISTS "CodingSequence_tenantId_entityType_idx" ON "CodingSequence"("tenantId", "entityType");
CREATE INDEX IF NOT EXISTS "CodingAllocationLog_tenantId_entityType_entityId_idx" ON "CodingAllocationLog"("tenantId", "entityType", "entityId");
CREATE INDEX IF NOT EXISTS "CodingAllocationLog_tenantId_code_idx" ON "CodingAllocationLog"("tenantId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "CodingAllocationLog_tenantId_entityType_code_key" ON "CodingAllocationLog"("tenantId", "entityType", "code");

