CREATE TYPE "SalesOrderStatus" AS ENUM (
  'DRAFT',
  'PENDING_APPROVAL',
  'CONFIRMED',
  'FULFILLING',
  'FULFILLED',
  'CANCELLED',
  'CLOSED'
);

CREATE TABLE IF NOT EXISTS "SalesOrder" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "contactId" TEXT,
  "dealId" TEXT,
  "quoteId" TEXT,
  "ownerId" TEXT NOT NULL,
  "orderNumber" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "orderedAt" TIMESTAMP(3),
  "expectedFulfillmentAt" TIMESTAMP(3),
  "fulfilledAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "lineItems" JSONB NOT NULL DEFAULT '[]',
  "customFields" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SalesOrder_tenantId_orderNumber_key" ON "SalesOrder"("tenantId", "orderNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "SalesOrder_id_tenantId_key" ON "SalesOrder"("id", "tenantId");
CREATE INDEX IF NOT EXISTS "SalesOrder_tenantId_accountId_idx" ON "SalesOrder"("tenantId", "accountId");
CREATE INDEX IF NOT EXISTS "SalesOrder_tenantId_contactId_idx" ON "SalesOrder"("tenantId", "contactId");
CREATE INDEX IF NOT EXISTS "SalesOrder_tenantId_quoteId_idx" ON "SalesOrder"("tenantId", "quoteId");
CREATE INDEX IF NOT EXISTS "SalesOrder_tenantId_status_idx" ON "SalesOrder"("tenantId", "status");
