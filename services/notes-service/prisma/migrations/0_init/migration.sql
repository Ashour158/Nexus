-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "leadId" TEXT,
    "contactId" TEXT,
    "accountId" TEXT,
    "dealId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "Note_tenantId_idx" ON "Note"("tenantId");

-- CreateIndex
CREATE INDEX "Note_tenantId_dealId_idx" ON "Note"("tenantId", "dealId");

-- CreateIndex
CREATE INDEX "Note_tenantId_contactId_idx" ON "Note"("tenantId", "contactId");

-- CreateIndex
CREATE INDEX "Note_tenantId_accountId_idx" ON "Note"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "Note_tenantId_leadId_idx" ON "Note"("tenantId", "leadId");

-- CreateIndex
CREATE INDEX "Note_tenantId_authorId_idx" ON "Note"("tenantId", "authorId");

-- CreateIndex
CREATE INDEX "Note_tenantId_createdAt_idx" ON "Note"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Note_id_tenantId_key" ON "Note"("id", "tenantId");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_createdAt_idx" ON "OutboxMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_aggregateId_idx" ON "OutboxMessage"("aggregateId");
