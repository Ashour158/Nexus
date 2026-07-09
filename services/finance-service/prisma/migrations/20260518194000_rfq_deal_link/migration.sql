ALTER TABLE "RFQ" ADD COLUMN "dealId" TEXT;
CREATE INDEX "RFQ_tenantId_dealId_idx" ON "RFQ"("tenantId", "dealId");
