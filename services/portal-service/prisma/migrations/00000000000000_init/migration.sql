-- CreateEnum
CREATE TYPE "PortalUserStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "PortalSharePermission" AS ENUM ('VIEW', 'COMMENT');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('QUOTE', 'CONTRACT', 'INVOICE', 'ACCOUNT');

-- CreateTable
CREATE TABLE "PortalToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalUser" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "portalRole" TEXT NOT NULL DEFAULT 'customer',
    "status" "PortalUserStatus" NOT NULL DEFAULT 'ACTIVE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "inviteToken" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "invitedBy" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalShare" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "portalUserId" TEXT,
    "accountId" TEXT,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "permission" "PortalSharePermission" NOT NULL DEFAULT 'VIEW',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalCase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "portalUserId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactId" TEXT,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "externalTicketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalCaseComment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "portalUserId" TEXT NOT NULL,
    "authorName" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalCaseComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalDealRegistration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "portalUserId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "dealName" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "estimatedValue" DOUBLE PRECISION,
    "currency" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "externalLeadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalDealRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalBranding" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#3B82F6',
    "companyName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalBranding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalAuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalAuditLog_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "PortalToken_token_key" ON "PortalToken"("token");

-- CreateIndex
CREATE INDEX "PortalToken_token_idx" ON "PortalToken"("token");

-- CreateIndex
CREATE INDEX "PortalToken_tenantId_entityId_idx" ON "PortalToken"("tenantId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalToken_id_tenantId_key" ON "PortalToken"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalUser_inviteToken_key" ON "PortalUser"("inviteToken");

-- CreateIndex
CREATE INDEX "PortalUser_tenantId_accountId_idx" ON "PortalUser"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "PortalUser_inviteToken_idx" ON "PortalUser"("inviteToken");

-- CreateIndex
CREATE UNIQUE INDEX "PortalUser_tenantId_email_key" ON "PortalUser"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "PortalUser_id_tenantId_key" ON "PortalUser"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PortalShare_tenantId_portalUserId_idx" ON "PortalShare"("tenantId", "portalUserId");

-- CreateIndex
CREATE INDEX "PortalShare_tenantId_accountId_idx" ON "PortalShare"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "PortalShare_tenantId_recordType_recordId_idx" ON "PortalShare"("tenantId", "recordType", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalShare_id_tenantId_key" ON "PortalShare"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PortalCase_tenantId_portalUserId_idx" ON "PortalCase"("tenantId", "portalUserId");

-- CreateIndex
CREATE INDEX "PortalCase_tenantId_accountId_idx" ON "PortalCase"("tenantId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalCase_id_tenantId_key" ON "PortalCase"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PortalCaseComment_tenantId_caseId_idx" ON "PortalCaseComment"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "PortalDealRegistration_tenantId_portalUserId_idx" ON "PortalDealRegistration"("tenantId", "portalUserId");

-- CreateIndex
CREATE INDEX "PortalDealRegistration_tenantId_accountId_idx" ON "PortalDealRegistration"("tenantId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalDealRegistration_id_tenantId_key" ON "PortalDealRegistration"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalBranding_tenantId_key" ON "PortalBranding"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalBranding_id_tenantId_key" ON "PortalBranding"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PortalAuditLog_tenantId_idx" ON "PortalAuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "PortalAuditLog_token_idx" ON "PortalAuditLog"("token");

-- CreateIndex
CREATE INDEX "PortalAuditLog_entityId_idx" ON "PortalAuditLog"("entityId");

-- CreateIndex
CREATE INDEX "PortalAuditLog_createdAt_idx" ON "PortalAuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PortalAuditLog_id_tenantId_key" ON "PortalAuditLog"("id", "tenantId");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_createdAt_idx" ON "OutboxMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_aggregateId_idx" ON "OutboxMessage"("aggregateId");

-- CreateIndex
CREATE INDEX "OutboxMessage_tenantId_idx" ON "OutboxMessage"("tenantId");

-- AddForeignKey
ALTER TABLE "PortalCaseComment" ADD CONSTRAINT "PortalCaseComment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "PortalCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

