CREATE TABLE IF NOT EXISTS "ForecastOverride" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "scopePipelineId" TEXT NOT NULL DEFAULT '',
    "repId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "originalValue" DECIMAL(15,2) NOT NULL,
    "overrideValue" DECIMAL(15,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForecastOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ForecastOverride_tenantId_periodKey_repId_scopePipelineId_key"
ON "ForecastOverride"("tenantId", "periodKey", "repId", "scopePipelineId");

CREATE INDEX IF NOT EXISTS "ForecastOverride_tenantId_periodKey_idx" ON "ForecastOverride"("tenantId", "periodKey");
