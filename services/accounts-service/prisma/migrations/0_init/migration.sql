-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('PROSPECT', 'CUSTOMER', 'PARTNER', 'COMPETITOR', 'RESELLER', 'OTHER');

-- CreateEnum
CREATE TYPE "AccountTier" AS ENUM ('STRATEGIC', 'ENTERPRISE', 'MID_MARKET', 'SMB');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'AT_RISK', 'CHURNED');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "parentAccountId" TEXT,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "industry" TEXT,
    "type" "AccountType" NOT NULL DEFAULT 'PROSPECT',
    "tier" "AccountTier" NOT NULL DEFAULT 'SMB',
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "annualRevenue" DECIMAL(18,2),
    "employeeCount" INTEGER,
    "country" TEXT,
    "city" TEXT,
    "address" TEXT,
    "zipCode" TEXT,
    "linkedInUrl" TEXT,
    "description" TEXT,
    "sicCode" TEXT,
    "naicsCode" TEXT,
    "healthScore" INTEGER,
    "npsScore" INTEGER,
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dataQualityScore" INTEGER,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountHealthScore" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "riskLevel" TEXT NOT NULL DEFAULT 'low',
    "churnProbability" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "signals" JSONB NOT NULL DEFAULT '{}',
    "lastActivityDays" INTEGER,
    "openDealsCount" INTEGER NOT NULL DEFAULT 0,
    "wonDealsCount" INTEGER NOT NULL DEFAULT 0,
    "lostDealsCount" INTEGER NOT NULL DEFAULT 0,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountHealthScore_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "Account_tenantId_idx" ON "Account"("tenantId");

-- CreateIndex
CREATE INDEX "Account_tenantId_type_idx" ON "Account"("tenantId", "type");

-- CreateIndex
CREATE INDEX "Account_tenantId_ownerId_idx" ON "Account"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "Account_tenantId_createdAt_idx" ON "Account"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Account_tenantId_updatedAt_idx" ON "Account"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "Account_tenantId_parentAccountId_idx" ON "Account"("tenantId", "parentAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_id_tenantId_key" ON "Account"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountHealthScore_accountId_key" ON "AccountHealthScore"("accountId");

-- CreateIndex
CREATE INDEX "AccountHealthScore_tenantId_idx" ON "AccountHealthScore"("tenantId");

-- CreateIndex
CREATE INDEX "AccountHealthScore_tenantId_riskLevel_idx" ON "AccountHealthScore"("tenantId", "riskLevel");

-- CreateIndex
CREATE UNIQUE INDEX "AccountHealthScore_id_tenantId_key" ON "AccountHealthScore"("id", "tenantId");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_createdAt_idx" ON "OutboxMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_aggregateId_idx" ON "OutboxMessage"("aggregateId");

-- AddForeignKey
ALTER TABLE "AccountHealthScore" ADD CONSTRAINT "AccountHealthScore_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
