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
CREATE TABLE "ReportFolder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "objectType" TEXT NOT NULL,
    "columns" JSONB NOT NULL DEFAULT '[]',
    "filters" JSONB NOT NULL DEFAULT '[]',
    "groupBy" TEXT,
    "sortBy" TEXT NOT NULL DEFAULT 'createdAt',
    "sortDir" TEXT NOT NULL DEFAULT 'desc',
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT NOT NULL,
    "folderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'csv',
    "recipients" TEXT[],
    "subject" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dashboard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dashboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardWidget" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "widgetType" TEXT NOT NULL,
    "reportId" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "position" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 6,
    "height" INTEGER NOT NULL DEFAULT 4,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardWidget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "stage" TEXT NOT NULL,
    "dealCount" INTEGER NOT NULL DEFAULT 0,
    "totalValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "dealIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportAuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "reportName" TEXT NOT NULL,
    "format" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BiSavedReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "spec" JSONB NOT NULL DEFAULT '{}',
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BiSavedReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BiDashboard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "layout" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BiDashboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BiDashboardWidget" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "chartType" TEXT NOT NULL,
    "spec" JSONB NOT NULL DEFAULT '{}',
    "position" JSONB NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BiDashboardWidget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxMessage" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "tenantId" TEXT,
    "key" TEXT,
    "payload" JSONB NOT NULL,
    "aggregateId" TEXT,
    "eventType" TEXT,
    "correlationId" TEXT,
    "headers" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportDefinition_tenantId_category_idx" ON "ReportDefinition"("tenantId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "ReportDefinition_id_tenantId_key" ON "ReportDefinition"("id", "tenantId");

-- CreateIndex
CREATE INDEX "DefinitionReportSchedule_tenantId_idx" ON "DefinitionReportSchedule"("tenantId");

-- CreateIndex
CREATE INDEX "DefinitionReportSchedule_isActive_nextRunAt_idx" ON "DefinitionReportSchedule"("isActive", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "DefinitionReportSchedule_id_tenantId_key" ON "DefinitionReportSchedule"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ReportFolder_tenantId_ownerId_idx" ON "ReportFolder"("tenantId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportFolder_id_tenantId_key" ON "ReportFolder"("id", "tenantId");

-- CreateIndex
CREATE INDEX "SavedReport_tenantId_ownerId_idx" ON "SavedReport"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "SavedReport_tenantId_objectType_idx" ON "SavedReport"("tenantId", "objectType");

-- CreateIndex
CREATE UNIQUE INDEX "SavedReport_id_tenantId_key" ON "SavedReport"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ReportSchedule_tenantId_idx" ON "ReportSchedule"("tenantId");

-- CreateIndex
CREATE INDEX "ReportSchedule_tenantId_isActive_nextRunAt_idx" ON "ReportSchedule"("tenantId", "isActive", "nextRunAt");

-- CreateIndex
CREATE INDEX "ReportSchedule_isActive_nextRunAt_idx" ON "ReportSchedule"("isActive", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReportSchedule_id_tenantId_key" ON "ReportSchedule"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Dashboard_tenantId_ownerId_idx" ON "Dashboard"("tenantId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Dashboard_id_tenantId_key" ON "Dashboard"("id", "tenantId");

-- CreateIndex
CREATE INDEX "DashboardWidget_tenantId_dashboardId_idx" ON "DashboardWidget"("tenantId", "dashboardId");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardWidget_id_tenantId_key" ON "DashboardWidget"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PipelineSnapshot_tenantId_pipelineId_snapshotDate_idx" ON "PipelineSnapshot"("tenantId", "pipelineId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineSnapshot_tenantId_pipelineId_snapshotDate_stage_key" ON "PipelineSnapshot"("tenantId", "pipelineId", "snapshotDate", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineSnapshot_id_tenantId_key" ON "PipelineSnapshot"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ReportAuditLog_tenantId_idx" ON "ReportAuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "ReportAuditLog_tenantId_action_idx" ON "ReportAuditLog"("tenantId", "action");

-- CreateIndex
CREATE INDEX "ReportAuditLog_createdAt_idx" ON "ReportAuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReportAuditLog_id_tenantId_key" ON "ReportAuditLog"("id", "tenantId");

-- CreateIndex
CREATE INDEX "BiSavedReport_tenantId_ownerId_idx" ON "BiSavedReport"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "BiSavedReport_tenantId_isShared_idx" ON "BiSavedReport"("tenantId", "isShared");

-- CreateIndex
CREATE UNIQUE INDEX "BiSavedReport_id_tenantId_key" ON "BiSavedReport"("id", "tenantId");

-- CreateIndex
CREATE INDEX "BiDashboard_tenantId_ownerId_idx" ON "BiDashboard"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "BiDashboard_tenantId_isShared_idx" ON "BiDashboard"("tenantId", "isShared");

-- CreateIndex
CREATE UNIQUE INDEX "BiDashboard_id_tenantId_key" ON "BiDashboard"("id", "tenantId");

-- CreateIndex
CREATE INDEX "BiDashboardWidget_tenantId_dashboardId_idx" ON "BiDashboardWidget"("tenantId", "dashboardId");

-- CreateIndex
CREATE UNIQUE INDEX "BiDashboardWidget_id_tenantId_key" ON "BiDashboardWidget"("id", "tenantId");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_createdAt_idx" ON "OutboxMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_aggregateId_idx" ON "OutboxMessage"("aggregateId");

-- CreateIndex
CREATE INDEX "OutboxMessage_tenantId_idx" ON "OutboxMessage"("tenantId");

-- AddForeignKey
ALTER TABLE "DefinitionReportSchedule" ADD CONSTRAINT "DefinitionReportSchedule_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ReportDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedReport" ADD CONSTRAINT "SavedReport_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ReportFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "SavedReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardWidget" ADD CONSTRAINT "DashboardWidget_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiDashboardWidget" ADD CONSTRAINT "BiDashboardWidget_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "BiDashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

