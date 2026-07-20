-- Cross-replica idempotency backstops for the money path.
--
-- The in-process guards in invoices.service.ts (single-flight for
-- order->invoice, reference dedup for payments) cover retries and same-instance
-- concurrency, which is complete protection while finance-service runs a single
-- replica. These two partial unique indexes are the backstop for when it scales
-- past one replica, where two instances could race the same operation.
--
-- Both are PARTIAL. Prisma's schema language cannot express a filtered unique
-- index, so they live in this hand-written migration rather than in a @@unique
-- on the model. `migrate deploy` applies the SQL verbatim; there is no db-push
-- reconciliation in this service, so the indexes are stable.
--
-- IF NOT EXISTS: the same statements were applied surgically to the live prod
-- database (which held 0 payments and 3 non-duplicated invoices, so neither
-- index could conflict). This lets `migrate deploy` record the migration as
-- applied without re-creating an index that is already present.

-- Payment: a retried external payment reference must not be recorded twice on
-- the same invoice. Partial on `reference IS NOT NULL` so cash / no-reference
-- payments (many per invoice) are unaffected. Scope matches the service's
-- dedup: (tenant, invoice, reference).
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_tenantId_invoiceId_reference_key"
  ON "Payment" ("tenantId", "invoiceId", "reference")
  WHERE "reference" IS NOT NULL;

-- Invoice: one order must not be invoiced twice. Partial on
-- `orderId IS NOT NULL AND status <> 'VOID'` so a VOIDed invoice releases its
-- order for legitimate re-invoicing — exactly the `status != 'VOID'`
-- idempotency check the service already performs.
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_tenantId_orderId_live_key"
  ON "Invoice" ("tenantId", "orderId")
  WHERE "orderId" IS NOT NULL AND "status" <> 'VOID'::"InvoiceStatus";
