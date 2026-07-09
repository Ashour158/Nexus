-- Forecast depth: point-in-time snapshots, per-deal rep categorization + manager
-- override, and AI/weighted columns on the event-driven aggregate.
-- Additive + idempotent-friendly. Apply to PLANNING_DATABASE_URL.

-- ForecastAggregate: probability-weighted + AI-adjusted open pipeline.
ALTER TABLE "ForecastAggregate"
  ADD COLUMN IF NOT EXISTS "weightedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "aiWeightedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- DealForecastState: carry stage probability + AI win-probability from events.
ALTER TABLE "DealForecastState"
  ADD COLUMN IF NOT EXISTS "probability" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "aiWinProbability" DOUBLE PRECISION;

-- Point-in-time forecast snapshots.
CREATE TABLE IF NOT EXISTS "ForecastSnapshot" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'owner',
  "ownerId" TEXT NOT NULL DEFAULT '',
  "period" TEXT NOT NULL,
  "asOf" TIMESTAMP(3) NOT NULL,
  "commitAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "bestCaseAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "pipelineAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "weightedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "aiWeightedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "closedWonAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "openDealCount" INTEGER NOT NULL DEFAULT 0,
  "wonDealCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForecastSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ForecastSnapshot_tenantId_scope_ownerId_period_asOf_key"
  ON "ForecastSnapshot" ("tenantId", "scope", "ownerId", "period", "asOf");
CREATE INDEX IF NOT EXISTS "ForecastSnapshot_tenantId_period_asOf_idx"
  ON "ForecastSnapshot" ("tenantId", "period", "asOf");
CREATE INDEX IF NOT EXISTS "ForecastSnapshot_tenantId_scope_period_idx"
  ON "ForecastSnapshot" ("tenantId", "scope", "period");
CREATE UNIQUE INDEX IF NOT EXISTS "ForecastSnapshot_id_tenantId_key"
  ON "ForecastSnapshot" ("id", "tenantId");

-- Rep per-deal categorization + manager override.
CREATE TABLE IF NOT EXISTS "ForecastDealEntry" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "dealId" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "repCategory" TEXT NOT NULL DEFAULT 'pipeline',
  "managerCategory" TEXT,
  "managerId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ForecastDealEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ForecastDealEntry_tenantId_period_dealId_key"
  ON "ForecastDealEntry" ("tenantId", "period", "dealId");
CREATE INDEX IF NOT EXISTS "ForecastDealEntry_tenantId_period_ownerId_idx"
  ON "ForecastDealEntry" ("tenantId", "period", "ownerId");
CREATE UNIQUE INDEX IF NOT EXISTS "ForecastDealEntry_id_tenantId_key"
  ON "ForecastDealEntry" ("id", "tenantId");
