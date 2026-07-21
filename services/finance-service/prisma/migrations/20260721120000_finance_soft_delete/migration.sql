-- Soft-delete columns for finance records that previously hard-deleted
-- (audit: "finance records lacking soft-delete"). Read paths filter
-- "deletedAt" IS NULL; delete endpoints stamp instead of removing rows.
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "PriceBook" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "ProductKit" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
