-- CreateEnum
CREATE TYPE "ContestMetric" AS ENUM ('DEALS_WON_COUNT', 'DEALS_WON_REVENUE', 'ACTIVITIES_COMPLETED', 'LEADS_CONVERTED', 'NEW_LOGOS');

-- CreateEnum
CREATE TYPE "CommissionBasis" AS ENUM ('REVENUE', 'MARGIN');

-- CreateEnum
CREATE TYPE "CommissionStatementStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID');

-- CreateTable
CREATE TABLE "Contest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "metric" "ContestMetric" NOT NULL,
    "targetValue" DECIMAL(18,2),
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "prizeDescription" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestEntry" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "currentValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContestEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "condition" JSONB NOT NULL,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BadgeAward" (
    "id" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BadgeAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricCounter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lastEventDate" TEXT,
    "streakValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "basis" "CommissionBasis" NOT NULL DEFAULT 'REVENUE',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appliesToRole" TEXT,
    "ownerId" TEXT,
    "productId" TEXT,
    "ratePercent" DECIMAL(6,3) NOT NULL,
    "tierMinAmount" DECIMAL(18,2),
    "tierMaxAmount" DECIMAL(18,2),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionStatement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "planId" TEXT,
    "ruleId" TEXT,
    "splitType" TEXT,
    "splitPercent" DECIMAL(6,3),
    "baseAmount" DECIMAL(18,2) NOT NULL,
    "ratePercent" DECIMAL(6,3) NOT NULL,
    "commissionAmount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "CommissionStatementStatus" NOT NULL DEFAULT 'PENDING',
    "periodMonth" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionStatement_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "Contest_tenantId_idx" ON "Contest"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Contest_id_tenantId_key" ON "Contest"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ContestEntry_contestId_currentValue_idx" ON "ContestEntry"("contestId", "currentValue");

-- CreateIndex
CREATE UNIQUE INDEX "ContestEntry_contestId_ownerId_key" ON "ContestEntry"("contestId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ContestEntry_id_tenantId_key" ON "ContestEntry"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_key_key" ON "Badge"("key");

-- CreateIndex
CREATE INDEX "Badge_tenantId_idx" ON "Badge"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_id_tenantId_key" ON "Badge"("id", "tenantId");

-- CreateIndex
CREATE INDEX "BadgeAward_tenantId_ownerId_idx" ON "BadgeAward"("tenantId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "BadgeAward_badgeId_tenantId_ownerId_key" ON "BadgeAward"("badgeId", "tenantId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "BadgeAward_id_tenantId_key" ON "BadgeAward"("id", "tenantId");

-- CreateIndex
CREATE INDEX "MetricCounter_tenantId_ownerId_idx" ON "MetricCounter"("tenantId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "MetricCounter_tenantId_ownerId_metric_key" ON "MetricCounter"("tenantId", "ownerId", "metric");

-- CreateIndex
CREATE INDEX "CommissionPlan_tenantId_isActive_idx" ON "CommissionPlan"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionPlan_id_tenantId_key" ON "CommissionPlan"("id", "tenantId");

-- CreateIndex
CREATE INDEX "CommissionRule_planId_idx" ON "CommissionRule"("planId");

-- CreateIndex
CREATE INDEX "CommissionRule_tenantId_idx" ON "CommissionRule"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionRule_id_tenantId_key" ON "CommissionRule"("id", "tenantId");

-- CreateIndex
CREATE INDEX "CommissionStatement_tenantId_ownerId_idx" ON "CommissionStatement"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "CommissionStatement_tenantId_status_idx" ON "CommissionStatement"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CommissionStatement_tenantId_periodMonth_idx" ON "CommissionStatement"("tenantId", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionStatement_tenantId_dealId_ownerId_key" ON "CommissionStatement"("tenantId", "dealId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionStatement_id_tenantId_key" ON "CommissionStatement"("id", "tenantId");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_createdAt_idx" ON "OutboxMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_aggregateId_idx" ON "OutboxMessage"("aggregateId");

-- CreateIndex
CREATE INDEX "OutboxMessage_tenantId_idx" ON "OutboxMessage"("tenantId");

-- AddForeignKey
ALTER TABLE "ContestEntry" ADD CONSTRAINT "ContestEntry_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeAward" ADD CONSTRAINT "BadgeAward_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CommissionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

