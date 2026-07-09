CREATE TYPE "DiscountRequestStatus" AS ENUM (
  'DRAFT',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED'
);

CREATE TYPE "DiscountReasonCode" AS ENUM (
  'COMPETITIVE_MATCH',
  'STRATEGIC_ACCOUNT',
  'VOLUME_COMMITMENT',
  'MULTI_YEAR_COMMITMENT',
  'NEW_LOGO_ACQUISITION',
  'RENEWAL_SAVE',
  'EXECUTIVE_EXCEPTION',
  'MARKET_ENTRY',
  'BUNDLE_NEGOTIATION',
  'PAYMENT_TERMS_TRADEOFF'
);

CREATE TABLE "DiscountRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "approvalRequestId" TEXT,
  "status" "DiscountRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reasonCode" "DiscountReasonCode" NOT NULL,
  "reasonLabel" TEXT NOT NULL,
  "reasonNotes" TEXT,
  "currentDiscountPercent" DECIMAL(9,4) NOT NULL DEFAULT 0,
  "requestedDiscountPercent" DECIMAL(9,4) NOT NULL,
  "requestedDiscountAmount" DECIMAL(18,2) NOT NULL,
  "winningProbabilityIfApproved" INTEGER NOT NULL,
  "businessImpact" TEXT,
  "competitorName" TEXT,
  "expiresAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectedById" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "customFields" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DiscountRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DiscountRequest_tenantId_quoteId_idx" ON "DiscountRequest"("tenantId", "quoteId");
CREATE INDEX "DiscountRequest_tenantId_status_idx" ON "DiscountRequest"("tenantId", "status");
CREATE INDEX "DiscountRequest_tenantId_requestedById_idx" ON "DiscountRequest"("tenantId", "requestedById");
CREATE UNIQUE INDEX "DiscountRequest_id_tenantId_key" ON "DiscountRequest"("id", "tenantId");

ALTER TABLE "DiscountRequest"
  ADD CONSTRAINT "DiscountRequest_quoteId_fkey"
  FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
