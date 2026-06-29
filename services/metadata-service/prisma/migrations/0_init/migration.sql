-- CreateTable
CREATE TABLE "CustomFieldDefinition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "showOnCard" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldPermission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "allowedRoles" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "condition" JSONB NOT NULL,
    "requirement" JSONB NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldChangeLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedBy" TEXT NOT NULL,
    "changedByName" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "masterRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "DuplicateGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6B7280',
    "entityType" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateRecord" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isMaster" BOOLEAN NOT NULL DEFAULT false,
    "snapshot" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "DuplicateRecord_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "CustomFieldDefinition_tenantId_entityType_idx" ON "CustomFieldDefinition"("tenantId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDefinition_tenantId_entityType_apiKey_key" ON "CustomFieldDefinition"("tenantId", "entityType", "apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDefinition_id_tenantId_key" ON "CustomFieldDefinition"("id", "tenantId");

-- CreateIndex
CREATE INDEX "FieldPermission_tenantId_objectType_idx" ON "FieldPermission"("tenantId", "objectType");

-- CreateIndex
CREATE UNIQUE INDEX "FieldPermission_tenantId_objectType_fieldName_key" ON "FieldPermission"("tenantId", "objectType", "fieldName");

-- CreateIndex
CREATE UNIQUE INDEX "FieldPermission_id_tenantId_key" ON "FieldPermission"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ValidationRule_tenantId_objectType_idx" ON "ValidationRule"("tenantId", "objectType");

-- CreateIndex
CREATE UNIQUE INDEX "ValidationRule_id_tenantId_key" ON "ValidationRule"("id", "tenantId");

-- CreateIndex
CREATE INDEX "FieldChangeLog_tenantId_objectType_objectId_idx" ON "FieldChangeLog"("tenantId", "objectType", "objectId");

-- CreateIndex
CREATE INDEX "FieldChangeLog_tenantId_changedAt_idx" ON "FieldChangeLog"("tenantId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FieldChangeLog_id_tenantId_key" ON "FieldChangeLog"("id", "tenantId");

-- CreateIndex
CREATE INDEX "DuplicateGroup_tenantId_entityType_status_idx" ON "DuplicateGroup"("tenantId", "entityType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateGroup_id_tenantId_key" ON "DuplicateGroup"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Tag_tenantId_idx" ON "Tag"("tenantId");

-- CreateIndex
CREATE INDEX "Tag_tenantId_entityType_idx" ON "Tag"("tenantId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_tenantId_name_key" ON "Tag"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_id_tenantId_key" ON "Tag"("id", "tenantId");

-- CreateIndex
CREATE INDEX "DuplicateRecord_groupId_idx" ON "DuplicateRecord"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateRecord_groupId_recordId_key" ON "DuplicateRecord"("groupId", "recordId");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_createdAt_idx" ON "OutboxMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_aggregateId_idx" ON "OutboxMessage"("aggregateId");

-- AddForeignKey
ALTER TABLE "DuplicateRecord" ADD CONSTRAINT "DuplicateRecord_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "DuplicateGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
