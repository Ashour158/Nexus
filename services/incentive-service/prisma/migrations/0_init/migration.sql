-- CreateEnum
CREATE TYPE "ContestMetric" AS ENUM ('DEALS_WON_COUNT', 'DEALS_WON_REVENUE', 'ACTIVITIES_COMPLETED', 'LEADS_CONVERTED', 'NEW_LOGOS');

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
CREATE TABLE "OutboxMessage" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "aggregateId" TEXT,
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
CREATE INDEX "OutboxMessage_status_createdAt_idx" ON "OutboxMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_aggregateId_idx" ON "OutboxMessage"("aggregateId");

-- AddForeignKey
ALTER TABLE "ContestEntry" ADD CONSTRAINT "ContestEntry_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeAward" ADD CONSTRAINT "BadgeAward_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
