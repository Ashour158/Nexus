-- Enforce the CRM rule that every contact must belong to an account.
-- Existing orphan contacts are preserved by linking them to a tenant-scoped
-- system account before the NOT NULL contract is applied.

INSERT INTO "Account" (
  "id",
  "tenantId",
  "ownerId",
  "name",
  "type",
  "status",
  "createdAt",
  "updatedAt"
)
SELECT
  'acct-unassigned-' || c."tenantId",
  c."tenantId",
  'system',
  'Unassigned Account',
  'PROSPECT',
  'ACTIVE',
  NOW(),
  NOW()
FROM "Contact" c
LEFT JOIN "Account" a ON a."id" = 'acct-unassigned-' || c."tenantId"
WHERE c."accountId" IS NULL
  AND a."id" IS NULL
GROUP BY c."tenantId";

UPDATE "Contact"
SET "accountId" = 'acct-unassigned-' || "tenantId"
WHERE "accountId" IS NULL;

ALTER TABLE "Contact" ALTER COLUMN "accountId" SET NOT NULL;
