-- BiReportSchedule — recurring delivery of a BiSavedReport (modern ReportSpec path).
-- Purely ADDITIVE: creates one new table + its indexes and FK. Touches no
-- existing table, column, or row. Safe to re-run (every step is guarded).
--
-- Mirrors services/reporting-service/prisma/schema.prisma model BiReportSchedule.
-- Applied with `prisma db execute` rather than `db push` because db push wants a
-- non-pooled connection and this database is fronted by pgbouncer.

CREATE TABLE IF NOT EXISTS "BiReportSchedule" (
  "id"         TEXT         NOT NULL,
  "tenantId"   TEXT         NOT NULL,
  "reportId"   TEXT         NOT NULL,
  "cron"       TEXT         NOT NULL,
  "format"     TEXT         NOT NULL DEFAULT 'csv',
  "recipients" TEXT[],
  "subject"    TEXT,
  "lastRunAt"  TIMESTAMP(3),
  "nextRunAt"  TIMESTAMP(3),
  "lastError"  TEXT,
  "isActive"   BOOLEAN      NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BiReportSchedule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BiReportSchedule_tenantId_idx"
  ON "BiReportSchedule" ("tenantId");

-- The runner's hot query: due rows for a tenant.
CREATE INDEX IF NOT EXISTS "BiReportSchedule_tenantId_isActive_nextRunAt_idx"
  ON "BiReportSchedule" ("tenantId", "isActive", "nextRunAt");

-- The runner's cross-tenant sweep every 60s.
CREATE INDEX IF NOT EXISTS "BiReportSchedule_isActive_nextRunAt_idx"
  ON "BiReportSchedule" ("isActive", "nextRunAt");

CREATE UNIQUE INDEX IF NOT EXISTS "BiReportSchedule_id_tenantId_key"
  ON "BiReportSchedule" ("id", "tenantId");

-- ADD CONSTRAINT has no IF NOT EXISTS, so guard it explicitly to stay re-runnable.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BiReportSchedule_reportId_fkey'
  ) THEN
    ALTER TABLE "BiReportSchedule"
      ADD CONSTRAINT "BiReportSchedule_reportId_fkey"
      FOREIGN KEY ("reportId") REFERENCES "BiSavedReport"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
