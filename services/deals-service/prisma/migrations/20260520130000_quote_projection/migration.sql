CREATE TABLE "QuoteProjection" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "accountId" TEXT,
  "contactId" TEXT,
  "dealId" TEXT,
  "rfqId" TEXT,
  "quoteNumber" TEXT,
  "status" TEXT NOT NULL,
  "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "currentRevisionId" TEXT,
  "validUntil" TIMESTAMP(3),
  "lastFinanceEventType" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL,
  "sourceEventVersion" INTEGER NOT NULL DEFAULT 1,
  "sourceAggregateId" TEXT,
  "transitionLedgerId" TEXT,
  "projectedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "QuoteProjection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "quote_projection_tenant_quote_key" ON "QuoteProjection"("tenantId", "quoteId");
CREATE UNIQUE INDEX "quote_projection_tenant_source_event_key" ON "QuoteProjection"("tenantId", "sourceEventId");
CREATE UNIQUE INDEX "quote_projection_id_tenant_key" ON "QuoteProjection"("id", "tenantId");
CREATE INDEX "quote_projection_tenant_account_idx" ON "QuoteProjection"("tenantId", "accountId");
CREATE INDEX "quote_projection_tenant_contact_idx" ON "QuoteProjection"("tenantId", "contactId");
CREATE INDEX "quote_projection_tenant_deal_idx" ON "QuoteProjection"("tenantId", "dealId");
CREATE INDEX "quote_projection_tenant_status_idx" ON "QuoteProjection"("tenantId", "status");

CREATE TABLE "QuoteProjectionEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL,
  "sourceEventVersion" INTEGER NOT NULL DEFAULT 1,
  "financeEventType" TEXT NOT NULL,
  "transitionLedgerId" TEXT,
  "projectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "QuoteProjectionEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "quote_projection_event_source_key" ON "QuoteProjectionEvent"("tenantId", "sourceEventId");
CREATE UNIQUE INDEX "quote_projection_event_id_tenant_key" ON "QuoteProjectionEvent"("id", "tenantId");
CREATE INDEX "quote_projection_event_quote_idx" ON "QuoteProjectionEvent"("tenantId", "quoteId");
CREATE INDEX "quote_projection_event_type_idx" ON "QuoteProjectionEvent"("tenantId", "financeEventType");
