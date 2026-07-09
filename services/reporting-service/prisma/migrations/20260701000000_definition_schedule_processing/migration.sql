-- Add scheduled-processing fields to DefinitionReportSchedule so the schedule
-- processor can scan for due schedules (isActive + nextRunAt) and advance them.
ALTER TABLE "DefinitionReportSchedule" ADD COLUMN "nextRunAt" TIMESTAMP(3);
ALTER TABLE "DefinitionReportSchedule" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Index for the due-schedule scan (WHERE isActive = true AND nextRunAt <= now()).
CREATE INDEX "DefinitionReportSchedule_isActive_nextRunAt_idx" ON "DefinitionReportSchedule"("isActive", "nextRunAt");
