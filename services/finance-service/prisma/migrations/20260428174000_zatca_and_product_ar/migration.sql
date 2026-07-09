-- AlterTable
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "nameAr" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "descriptionAr" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "unitAr" TEXT;

-- CreateTable
CREATE TABLE "ZatcaSubmission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "clearanceStatus" TEXT,
    "zatcaUuid" TEXT,
    "qrCode" TEXT,
    "invoiceHash" TEXT,
    "warnings" JSONB,
    "errors" JSONB,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZatcaSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ZatcaSubmission_invoiceId_key" ON "ZatcaSubmission"("invoiceId");

CREATE INDEX "ZatcaSubmission_tenantId_idx" ON "ZatcaSubmission"("tenantId");

CREATE INDEX "ZatcaSubmission_status_tenantId_idx" ON "ZatcaSubmission"("status", "tenantId");
