ALTER TABLE "QuoteProjection"
  ADD COLUMN "sourceAggregateType" TEXT,
  ADD COLUMN "correlationId" TEXT,
  ADD COLUMN "projectionVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "QuoteProjectionEvent"
  ADD COLUMN "sourceAggregateId" TEXT,
  ADD COLUMN "sourceAggregateType" TEXT,
  ADD COLUMN "correlationId" TEXT,
  ADD COLUMN "projectionVersion" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "quote_projection_tenant_correlation_idx" ON "QuoteProjection"("tenantId", "correlationId");
CREATE INDEX "quote_projection_event_correlation_idx" ON "QuoteProjectionEvent"("tenantId", "correlationId");
