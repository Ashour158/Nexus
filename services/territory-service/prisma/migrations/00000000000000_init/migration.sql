-- CreateEnum
CREATE TYPE "TerritoryType" AS ENUM ('GEOGRAPHIC', 'INDUSTRY', 'ACCOUNT_SIZE', 'CUSTOM');

-- CreateTable
CREATE TABLE "Territory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "TerritoryType" NOT NULL DEFAULT 'GEOGRAPHIC',
    "ownerIds" TEXT[],
    "teamId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Territory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerritoryMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "territoryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TerritoryMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "territoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityType" TEXT NOT NULL DEFAULT 'lead',
    "criteria" JSONB NOT NULL DEFAULT '{}',
    "ownerId" TEXT,
    "queue" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssignmentRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerritoryRule" (
    "id" TEXT NOT NULL,
    "territoryId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TerritoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadRoutingLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "recordType" TEXT NOT NULL DEFAULT 'LEAD',
    "matchedTerritoryId" TEXT,
    "matchedRuleIds" TEXT[],
    "viaDefault" BOOLEAN NOT NULL DEFAULT false,
    "assignedOwnerId" TEXT,
    "routedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadRoutingLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundRobinState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "territoryId" TEXT NOT NULL,
    "lastIndex" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoundRobinState_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "Territory_tenantId_idx" ON "Territory"("tenantId");

-- CreateIndex
CREATE INDEX "Territory_tenantId_parentId_idx" ON "Territory"("tenantId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Territory_id_tenantId_key" ON "Territory"("id", "tenantId");

-- CreateIndex
CREATE INDEX "TerritoryMember_tenantId_territoryId_idx" ON "TerritoryMember"("tenantId", "territoryId");

-- CreateIndex
CREATE UNIQUE INDEX "TerritoryMember_tenantId_territoryId_userId_key" ON "TerritoryMember"("tenantId", "territoryId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TerritoryMember_id_tenantId_key" ON "TerritoryMember"("id", "tenantId");

-- CreateIndex
CREATE INDEX "AssignmentRule_tenantId_isActive_priority_idx" ON "AssignmentRule"("tenantId", "isActive", "priority");

-- CreateIndex
CREATE INDEX "AssignmentRule_territoryId_idx" ON "AssignmentRule"("territoryId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentRule_id_tenantId_key" ON "AssignmentRule"("id", "tenantId");

-- CreateIndex
CREATE INDEX "LeadRoutingLog_tenantId_leadId_idx" ON "LeadRoutingLog"("tenantId", "leadId");

-- CreateIndex
CREATE INDEX "LeadRoutingLog_tenantId_recordType_idx" ON "LeadRoutingLog"("tenantId", "recordType");

-- CreateIndex
CREATE UNIQUE INDEX "LeadRoutingLog_id_tenantId_key" ON "LeadRoutingLog"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "RoundRobinState_tenantId_territoryId_key" ON "RoundRobinState"("tenantId", "territoryId");

-- CreateIndex
CREATE UNIQUE INDEX "RoundRobinState_id_tenantId_key" ON "RoundRobinState"("id", "tenantId");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_createdAt_idx" ON "OutboxMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_aggregateId_idx" ON "OutboxMessage"("aggregateId");

-- CreateIndex
CREATE INDEX "OutboxMessage_tenantId_idx" ON "OutboxMessage"("tenantId");

-- AddForeignKey
ALTER TABLE "Territory" ADD CONSTRAINT "Territory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Territory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerritoryMember" ADD CONSTRAINT "TerritoryMember_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentRule" ADD CONSTRAINT "AssignmentRule_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerritoryRule" ADD CONSTRAINT "TerritoryRule_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadRoutingLog" ADD CONSTRAINT "LeadRoutingLog_matchedTerritoryId_fkey" FOREIGN KEY ("matchedTerritoryId") REFERENCES "Territory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

