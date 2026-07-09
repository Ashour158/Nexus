ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "contactId" TEXT;

CREATE INDEX IF NOT EXISTS "Quote_tenantId_contactId_idx" ON "Quote"("tenantId", "contactId");
