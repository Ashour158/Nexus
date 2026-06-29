-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "RecycleBinItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "recordSnapshot" JSONB NOT NULL,
    "deletedBy" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecycleBinItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldAuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "columns" JSONB NOT NULL DEFAULT '[]',
    "sortBy" TEXT,
    "sortDir" TEXT NOT NULL DEFAULT 'asc',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecentRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "fileName" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "fieldMap" JSONB NOT NULL DEFAULT '{}',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "RecycleBinItem_tenantId_module_idx" ON "RecycleBinItem"("tenantId", "module");

-- CreateIndex
CREATE INDEX "RecycleBinItem_tenantId_expiresAt_idx" ON "RecycleBinItem"("tenantId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecycleBinItem_id_tenantId_key" ON "RecycleBinItem"("id", "tenantId");

-- CreateIndex
CREATE INDEX "FieldAuditLog_tenantId_module_recordId_idx" ON "FieldAuditLog"("tenantId", "module", "recordId");

-- CreateIndex
CREATE INDEX "FieldAuditLog_tenantId_changedAt_idx" ON "FieldAuditLog"("tenantId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FieldAuditLog_id_tenantId_key" ON "FieldAuditLog"("id", "tenantId");

-- CreateIndex
CREATE INDEX "SavedView_tenantId_userId_module_idx" ON "SavedView"("tenantId", "userId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "SavedView_tenantId_userId_module_name_key" ON "SavedView"("tenantId", "userId", "module", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SavedView_id_tenantId_key" ON "SavedView"("id", "tenantId");

-- CreateIndex
CREATE INDEX "RecentRecord_tenantId_userId_idx" ON "RecentRecord"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RecentRecord_tenantId_userId_module_recordId_key" ON "RecentRecord"("tenantId", "userId", "module", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "RecentRecord_id_tenantId_key" ON "RecentRecord"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ImportJob_tenantId_module_idx" ON "ImportJob"("tenantId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "ImportJob_id_tenantId_key" ON "ImportJob"("id", "tenantId");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_createdAt_idx" ON "OutboxMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_aggregateId_idx" ON "OutboxMessage"("aggregateId");
