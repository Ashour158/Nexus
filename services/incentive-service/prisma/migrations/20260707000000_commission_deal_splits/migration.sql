-- Deal-team split commissions: credit one CommissionStatement per revenue-split
-- rep instead of only the deal owner. Additive + backward compatible.
--
-- Guarded with IF EXISTS / IF NOT EXISTS because the Commission* tables are
-- managed via `prisma db push` in some environments and may not have been
-- created by a prior migration; this migration is then a safe no-op there.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'CommissionStatement') THEN

    -- Additive columns for split attribution (null for legacy single-owner rows).
    ALTER TABLE "CommissionStatement" ADD COLUMN IF NOT EXISTS "splitType" TEXT;
    ALTER TABLE "CommissionStatement" ADD COLUMN IF NOT EXISTS "splitPercent" DECIMAL(6,3);

    -- Widen idempotency key from (tenantId, dealId) to (tenantId, dealId, ownerId)
    -- so each deal-team member gets their own statement while replays stay idempotent.
    DROP INDEX IF EXISTS "CommissionStatement_tenantId_dealId_key";
    CREATE UNIQUE INDEX IF NOT EXISTS "CommissionStatement_tenantId_dealId_ownerId_key"
      ON "CommissionStatement"("tenantId", "dealId", "ownerId");

  END IF;
END $$;
