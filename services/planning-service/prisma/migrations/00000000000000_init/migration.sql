-- CreateEnum
CREATE TYPE "ForecastReviewStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'ADJUSTED');

-- CreateEnum
CREATE TYPE "QuotaType" AS ENUM ('REVENUE', 'DEAL_COUNT', 'ACTIVITY_COUNT', 'NEW_LOGOS');

-- CreateEnum
CREATE TYPE "QuotaOwnerType" AS ENUM ('USER', 'TEAM');

-- CreateEnum
CREATE TYPE "ForecastCategoryKind" AS ENUM ('COMMIT', 'BEST_CASE', 'PIPELINE', 'OMITTED', 'CLOSED');

-- CreateTable
CREATE TABLE "QuotaPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER,
    "type" "QuotaType" NOT NULL DEFAULT 'REVENUE',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotaPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotaTarget" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "targetValue" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotaTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastSubmission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "commitAmount" DECIMAL(18,2) NOT NULL,
    "bestCaseAmount" DECIMAL(18,2) NOT NULL,
    "pipelineAmount" DECIMAL(18,2) NOT NULL,
    "commentary" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForecastSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastReview" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "status" "ForecastReviewStatus" NOT NULL DEFAULT 'APPROVED',
    "adjustedCommit" DECIMAL(18,2),
    "adjustedBest" DECIMAL(18,2),
    "note" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForecastReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastOverride" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "repId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "originalValue" DECIMAL(18,2) NOT NULL,
    "overrideValue" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "scopePipelineId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForecastOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastAggregate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "commitAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "bestCaseAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "pipelineAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "weightedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "aiWeightedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "closedWonAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "openDealCount" INTEGER NOT NULL DEFAULT 0,
    "wonDealCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForecastAggregate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealForecastState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL DEFAULT 'pipeline',
    "stage" TEXT NOT NULL DEFAULT '',
    "probability" INTEGER NOT NULL DEFAULT 0,
    "aiWinProbability" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealForecastState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastSnapshot" (
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

-- CreateTable
CREATE TABLE "ForecastDealEntry" (
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

-- CreateTable
CREATE TABLE "Quota" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerType" "QuotaOwnerType" NOT NULL DEFAULT 'USER',
    "ownerId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "targetAmount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastCategoryMap" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "category" "ForecastCategoryKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForecastCategoryMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxMessage" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "tenantId" TEXT,
    "key" TEXT,
    "payload" JSONB NOT NULL,
    "aggregateId" TEXT,
    "eventType" TEXT,
    "correlationId" TEXT,
    "headers" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuotaPlan_tenantId_year_idx" ON "QuotaPlan"("tenantId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "QuotaPlan_id_tenantId_key" ON "QuotaPlan"("id", "tenantId");

-- CreateIndex
CREATE INDEX "QuotaTarget_tenantId_ownerId_idx" ON "QuotaTarget"("tenantId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "QuotaTarget_planId_ownerId_key" ON "QuotaTarget"("planId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "QuotaTarget_id_tenantId_key" ON "QuotaTarget"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ForecastSubmission_tenantId_ownerId_period_idx" ON "ForecastSubmission"("tenantId", "ownerId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastSubmission_tenantId_ownerId_period_key" ON "ForecastSubmission"("tenantId", "ownerId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastSubmission_id_tenantId_key" ON "ForecastSubmission"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ForecastOverride_tenantId_periodKey_idx" ON "ForecastOverride"("tenantId", "periodKey");

-- CreateIndex
CREATE INDEX "ForecastOverride_tenantId_repId_idx" ON "ForecastOverride"("tenantId", "repId");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastOverride_tenantId_periodKey_repId_scopePipelineId_key" ON "ForecastOverride"("tenantId", "periodKey", "repId", "scopePipelineId");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastOverride_id_tenantId_key" ON "ForecastOverride"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ForecastAggregate_tenantId_period_idx" ON "ForecastAggregate"("tenantId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastAggregate_tenantId_ownerId_period_key" ON "ForecastAggregate"("tenantId", "ownerId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastAggregate_id_tenantId_key" ON "ForecastAggregate"("id", "tenantId");

-- CreateIndex
CREATE INDEX "DealForecastState_tenantId_ownerId_period_idx" ON "DealForecastState"("tenantId", "ownerId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "DealForecastState_tenantId_dealId_key" ON "DealForecastState"("tenantId", "dealId");

-- CreateIndex
CREATE UNIQUE INDEX "DealForecastState_id_tenantId_key" ON "DealForecastState"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ForecastSnapshot_tenantId_period_asOf_idx" ON "ForecastSnapshot"("tenantId", "period", "asOf");

-- CreateIndex
CREATE INDEX "ForecastSnapshot_tenantId_scope_period_idx" ON "ForecastSnapshot"("tenantId", "scope", "period");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastSnapshot_tenantId_scope_ownerId_period_asOf_key" ON "ForecastSnapshot"("tenantId", "scope", "ownerId", "period", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastSnapshot_id_tenantId_key" ON "ForecastSnapshot"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ForecastDealEntry_tenantId_period_ownerId_idx" ON "ForecastDealEntry"("tenantId", "period", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastDealEntry_tenantId_period_dealId_key" ON "ForecastDealEntry"("tenantId", "period", "dealId");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastDealEntry_id_tenantId_key" ON "ForecastDealEntry"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Quota_tenantId_period_idx" ON "Quota"("tenantId", "period");

-- CreateIndex
CREATE INDEX "Quota_tenantId_ownerId_idx" ON "Quota"("tenantId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Quota_tenantId_ownerType_ownerId_period_key" ON "Quota"("tenantId", "ownerType", "ownerId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "Quota_id_tenantId_key" ON "Quota"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ForecastCategoryMap_tenantId_idx" ON "ForecastCategoryMap"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastCategoryMap_tenantId_stage_key" ON "ForecastCategoryMap"("tenantId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastCategoryMap_id_tenantId_key" ON "ForecastCategoryMap"("id", "tenantId");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_createdAt_idx" ON "OutboxMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_aggregateId_idx" ON "OutboxMessage"("aggregateId");

-- CreateIndex
CREATE INDEX "OutboxMessage_tenantId_idx" ON "OutboxMessage"("tenantId");

-- AddForeignKey
ALTER TABLE "QuotaTarget" ADD CONSTRAINT "QuotaTarget_planId_fkey" FOREIGN KEY ("planId") REFERENCES "QuotaPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastReview" ADD CONSTRAINT "ForecastReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ForecastSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

