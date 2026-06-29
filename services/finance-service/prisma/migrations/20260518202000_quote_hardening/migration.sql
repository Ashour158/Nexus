-- Quote hardening: normalized lines, immutable revisions, template versioning,
-- document rendering records, e-sign envelopes, and explicit quote expiry.

CREATE TYPE "QuoteTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "QuoteDocumentFormat" AS ENUM ('HTML', 'PDF', 'DOCX');
CREATE TYPE "QuoteDocumentStatus" AS ENUM ('QUEUED', 'RENDERED', 'FAILED', 'ARCHIVED');
CREATE TYPE "QuoteESignStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'SIGNED', 'DECLINED', 'VOIDED', 'EXPIRED');

ALTER TABLE "QuoteTemplate"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "status" "QuoteTemplateStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "contentType" TEXT NOT NULL DEFAULT 'text/html',
  ADD COLUMN "body" TEXT;

CREATE TABLE "QuoteLine" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productName" TEXT,
  "description" TEXT,
  "quantity" DECIMAL(18,6) NOT NULL,
  "listPrice" DECIMAL(18,2),
  "unitPrice" DECIMAL(18,2) NOT NULL,
  "discountPercent" DECIMAL(9,4) NOT NULL DEFAULT 0,
  "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "taxPercent" DECIMAL(9,4) NOT NULL DEFAULT 0,
  "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "lineTotal" DECIMAL(18,2) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL DEFAULT 'CPQ',
  "customFields" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuoteRevision" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "QuoteStatus" NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuoteDocument" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "templateId" TEXT,
  "format" "QuoteDocumentFormat" NOT NULL,
  "status" "QuoteDocumentStatus" NOT NULL DEFAULT 'QUEUED',
  "storageKey" TEXT,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "renderedHtml" TEXT,
  "renderData" JSONB NOT NULL DEFAULT '{}',
  "error" TEXT,
  "generatedById" TEXT,
  "generatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuoteESignEnvelope" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "documentId" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'INTERNAL',
  "providerEnvelopeId" TEXT,
  "status" "QuoteESignStatus" NOT NULL DEFAULT 'DRAFT',
  "recipientName" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "sentById" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3),
  "viewedAt" TIMESTAMP(3),
  "signedAt" TIMESTAMP(3),
  "declinedAt" TIMESTAMP(3),
  "declinedReason" TEXT,
  "expiresAt" TIMESTAMP(3),
  "auditTrail" JSONB NOT NULL DEFAULT '[]',
  "customFields" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteESignEnvelope_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuoteLine_tenantId_quoteId_idx" ON "QuoteLine"("tenantId", "quoteId");
CREATE INDEX "QuoteLine_tenantId_productId_idx" ON "QuoteLine"("tenantId", "productId");
CREATE UNIQUE INDEX "QuoteLine_id_tenantId_key" ON "QuoteLine"("id", "tenantId");

CREATE UNIQUE INDEX "QuoteRevision_tenantId_quoteId_version_key" ON "QuoteRevision"("tenantId", "quoteId", "version");
CREATE INDEX "QuoteRevision_tenantId_quoteId_idx" ON "QuoteRevision"("tenantId", "quoteId");
CREATE UNIQUE INDEX "QuoteRevision_id_tenantId_key" ON "QuoteRevision"("id", "tenantId");

CREATE INDEX "QuoteTemplate_tenantId_isActive_language_idx" ON "QuoteTemplate"("tenantId", "isActive", "language");
CREATE UNIQUE INDEX "QuoteTemplate_tenantId_name_version_language_key" ON "QuoteTemplate"("tenantId", "name", "version", "language");

CREATE INDEX "QuoteDocument_tenantId_quoteId_idx" ON "QuoteDocument"("tenantId", "quoteId");
CREATE INDEX "QuoteDocument_tenantId_status_idx" ON "QuoteDocument"("tenantId", "status");
CREATE UNIQUE INDEX "QuoteDocument_id_tenantId_key" ON "QuoteDocument"("id", "tenantId");

CREATE INDEX "QuoteESignEnvelope_tenantId_quoteId_idx" ON "QuoteESignEnvelope"("tenantId", "quoteId");
CREATE INDEX "QuoteESignEnvelope_tenantId_status_idx" ON "QuoteESignEnvelope"("tenantId", "status");
CREATE UNIQUE INDEX "QuoteESignEnvelope_id_tenantId_key" ON "QuoteESignEnvelope"("id", "tenantId");

ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteRevision" ADD CONSTRAINT "QuoteRevision_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteDocument" ADD CONSTRAINT "QuoteDocument_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteDocument" ADD CONSTRAINT "QuoteDocument_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "QuoteTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuoteESignEnvelope" ADD CONSTRAINT "QuoteESignEnvelope_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
