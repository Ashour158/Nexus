ALTER TABLE "Contact"
  ADD COLUMN "lifecycleStage" TEXT NOT NULL DEFAULT 'New relationship',
  ADD COLUMN "buyingCommitteeRole" TEXT,
  ADD COLUMN "influenceLevel" TEXT,
  ADD COLUMN "relationshipScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "slaStatus" TEXT NOT NULL DEFAULT 'needs-first-touch',
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedBy" TEXT,
  ADD COLUMN "archiveReason" TEXT,
  ADD COLUMN "mergedIntoContactId" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "ContactDocument" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'General',
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "storageKey" TEXT NOT NULL,
  "checksum" TEXT,
  "scanStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "retentionCategory" TEXT NOT NULL DEFAULT 'customer-record',
  "uploadedBy" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContactDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContactAuditEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContactFieldHistory" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "fieldName" TEXT NOT NULL,
  "oldValue" JSONB,
  "newValue" JSONB,
  "changedBy" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactFieldHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContactLifecycleEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "fromStage" TEXT,
  "toStage" TEXT NOT NULL,
  "reason" TEXT,
  "actorId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactLifecycleEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContactMailThread" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "fromEmail" TEXT,
  "toEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "messageCount" INTEGER NOT NULL DEFAULT 1,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "snippet" TEXT,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContactMailThread_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactDocument_id_tenantId_key" ON "ContactDocument"("id", "tenantId");
CREATE INDEX "ContactDocument_tenantId_contactId_idx" ON "ContactDocument"("tenantId", "contactId");
CREATE INDEX "ContactDocument_tenantId_scanStatus_idx" ON "ContactDocument"("tenantId", "scanStatus");
CREATE INDEX "ContactDocument_tenantId_retentionCategory_idx" ON "ContactDocument"("tenantId", "retentionCategory");

CREATE UNIQUE INDEX "ContactAuditEvent_id_tenantId_key" ON "ContactAuditEvent"("id", "tenantId");
CREATE INDEX "ContactAuditEvent_tenantId_contactId_occurredAt_idx" ON "ContactAuditEvent"("tenantId", "contactId", "occurredAt");
CREATE INDEX "ContactAuditEvent_tenantId_action_idx" ON "ContactAuditEvent"("tenantId", "action");

CREATE UNIQUE INDEX "ContactFieldHistory_id_tenantId_key" ON "ContactFieldHistory"("id", "tenantId");
CREATE INDEX "ContactFieldHistory_tenantId_contactId_changedAt_idx" ON "ContactFieldHistory"("tenantId", "contactId", "changedAt");
CREATE INDEX "ContactFieldHistory_tenantId_fieldName_idx" ON "ContactFieldHistory"("tenantId", "fieldName");

CREATE UNIQUE INDEX "ContactLifecycleEvent_id_tenantId_key" ON "ContactLifecycleEvent"("id", "tenantId");
CREATE INDEX "ContactLifecycleEvent_tenantId_contactId_occurredAt_idx" ON "ContactLifecycleEvent"("tenantId", "contactId", "occurredAt");
CREATE INDEX "ContactLifecycleEvent_tenantId_toStage_idx" ON "ContactLifecycleEvent"("tenantId", "toStage");

CREATE UNIQUE INDEX "ContactMailThread_tenantId_provider_externalId_key" ON "ContactMailThread"("tenantId", "provider", "externalId");
CREATE UNIQUE INDEX "ContactMailThread_id_tenantId_key" ON "ContactMailThread"("id", "tenantId");
CREATE INDEX "ContactMailThread_tenantId_contactId_idx" ON "ContactMailThread"("tenantId", "contactId");
CREATE INDEX "ContactMailThread_tenantId_lastMessageAt_idx" ON "ContactMailThread"("tenantId", "lastMessageAt");

CREATE INDEX "Contact_tenantId_archivedAt_idx" ON "Contact"("tenantId", "archivedAt");
CREATE INDEX "Contact_tenantId_lifecycleStage_idx" ON "Contact"("tenantId", "lifecycleStage");
CREATE INDEX "Contact_tenantId_slaStatus_idx" ON "Contact"("tenantId", "slaStatus");
CREATE INDEX "Contact_tenantId_mergedIntoContactId_idx" ON "Contact"("tenantId", "mergedIntoContactId");

ALTER TABLE "ContactDocument" ADD CONSTRAINT "ContactDocument_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactAuditEvent" ADD CONSTRAINT "ContactAuditEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactFieldHistory" ADD CONSTRAINT "ContactFieldHistory_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactLifecycleEvent" ADD CONSTRAINT "ContactLifecycleEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactMailThread" ADD CONSTRAINT "ContactMailThread_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
