-- CreateTable
CREATE TABLE "ReportDefinition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "datasource" TEXT NOT NULL,
    "querySpec" JSONB NOT NULL,
    "ownerId" TEXT,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefinitionReportSchedule" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'xlsx',
    "recipients" TEXT[],
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DefinitionReportSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "objectType" TEXT NOT NULL,
    "columns" JSONB NOT NULL,
    "filters" JSONB NOT NULL,
    "groupBy" TEXT,
    "sortBy" TEXT DEFAULT 'createdAt',
    "sortDir" TEXT DEFAULT 'desc',
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT NOT NULL,
    "folderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportFolder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_report_schedules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "cronExpr" TEXT NOT NULL,
    "recipients" JSONB NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'pdf',
    "subject" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_report_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dashboard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dashboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardWidget" (
    "id" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reportId" TEXT,
    "config" JSONB NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 6,
    "height" INTEGER NOT NULL DEFAULT 4,

    CONSTRAINT "DashboardWidget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL DEFAULT 'all',
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportDefinition_tenantId_category_idx" ON "ReportDefinition"("tenantId", "category");

-- CreateIndex
CREATE INDEX "DefinitionReportSchedule_tenantId_idx" ON "DefinitionReportSchedule"("tenantId");

-- CreateIndex
CREATE INDEX "DefinitionReportSchedule_nextRunAt_isActive_idx" ON "DefinitionReportSchedule"("nextRunAt", "isActive");

-- CreateIndex
CREATE INDEX "SavedReport_tenantId_idx" ON "SavedReport"("tenantId");

-- CreateIndex
CREATE INDEX "SavedReport_tenantId_ownerId_idx" ON "SavedReport"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "ReportFolder_tenantId_idx" ON "ReportFolder"("tenantId");

-- CreateIndex
CREATE INDEX "saved_report_schedules_tenantId_idx" ON "saved_report_schedules"("tenantId");

-- CreateIndex
CREATE INDEX "saved_report_schedules_nextRunAt_isActive_idx" ON "saved_report_schedules"("nextRunAt", "isActive");

-- CreateIndex
CREATE INDEX "Dashboard_tenantId_idx" ON "Dashboard"("tenantId");

-- CreateIndex
CREATE INDEX "Dashboard_tenantId_isPinned_idx" ON "Dashboard"("tenantId", "isPinned");

-- CreateIndex
CREATE INDEX "DashboardWidget_dashboardId_idx" ON "DashboardWidget"("dashboardId");

-- CreateIndex
CREATE INDEX "PipelineSnapshot_tenantId_snapshotDate_idx" ON "PipelineSnapshot"("tenantId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineSnapshot_tenantId_pipelineId_snapshotDate_key" ON "PipelineSnapshot"("tenantId", "pipelineId", "snapshotDate");

-- AddForeignKey
ALTER TABLE "DefinitionReportSchedule" ADD CONSTRAINT "DefinitionReportSchedule_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ReportDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedReport" ADD CONSTRAINT "SavedReport_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ReportFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_report_schedules" ADD CONSTRAINT "saved_report_schedules_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "SavedReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardWidget" ADD CONSTRAINT "DashboardWidget_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

