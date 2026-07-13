-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "JourneyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'EXITED');

-- CreateEnum
CREATE TYPE "CommandJourneyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CommandEnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXITED', 'FAILED');

-- CreateTable
CREATE TABLE "WorkflowTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger" TEXT NOT NULL,
    "triggerConditions" JSONB NOT NULL DEFAULT '{}',
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowExecution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "triggerPayload" JSONB NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "currentNodeId" TEXT,
    "resumeAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "parentForkId" TEXT,
    "parentExecId" TEXT,

    CONSTRAINT "WorkflowExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowForkTracker" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "forkNodeId" TEXT NOT NULL,
    "joinNodeId" TEXT NOT NULL,
    "branchNodeIds" TEXT[],
    "completedIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowForkTracker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStep" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "status" "StepStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "JourneyStatus" NOT NULL DEFAULT 'DRAFT',
    "entryTrigger" TEXT NOT NULL,
    "entryConfig" JSONB NOT NULL DEFAULT '{}',
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Journey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyEnrollment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "currentNodeId" TEXT,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitedAt" TIMESTAMP(3),
    "exitReason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "JourneyEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommandJourney" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "entityType" TEXT NOT NULL,
    "status" "CommandJourneyStatus" NOT NULL DEFAULT 'DRAFT',
    "entryTrigger" JSONB NOT NULL DEFAULT '{}',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "exitCriteria" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommandJourney_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommandJourneyEnrollment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "currentStepId" TEXT,
    "status" "CommandEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "context" JSONB NOT NULL DEFAULT '{}',
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resumeAt" TIMESTAMP(3),
    "lastStepAt" TIMESTAMP(3),
    "error" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommandJourneyEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "module" TEXT NOT NULL,
    "triggerEvent" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL DEFAULT 'record_action',
    "triggerConfig" JSONB NOT NULL DEFAULT '{}',
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "scheduledActions" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledAutomationAction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'delay',
    "dedupeKey" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL,
    "action" JSONB NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "firedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledAutomationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DateBasedTrigger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "dateField" TEXT NOT NULL,
    "offset" INTEGER NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'days',
    "direction" TEXT NOT NULL DEFAULT 'before',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DateBasedTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRuleVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRuleRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "error" TEXT,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRuleRun_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "SlaDefinition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "entityType" TEXT NOT NULL,
    "stageId" TEXT,
    "condition" JSONB NOT NULL DEFAULT '{}',
    "timeLimitHours" INTEGER NOT NULL DEFAULT 24,
    "businessHoursOnly" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlaDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaBreach" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slaId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BREACHED',
    "breachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "escalationLevel" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "SlaBreach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalationRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "criteria" JSONB,
    "tiers" JSONB NOT NULL DEFAULT '[]',
    "businessHoursOnly" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscalationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalationInstance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "recordData" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentTier" INTEGER NOT NULL DEFAULT 0,
    "nextFireAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscalationInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoringRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordScore" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "breakdown" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThresholdAlert" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "notifyRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notifyUsers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThresholdAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThresholdAlertState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "crossed" BOOLEAN NOT NULL DEFAULT false,
    "lastFiredAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThresholdAlertState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowTemplate_tenantId_idx" ON "WorkflowTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "WorkflowTemplate_tenantId_trigger_isActive_idx" ON "WorkflowTemplate"("tenantId", "trigger", "isActive");

-- CreateIndex
CREATE INDEX "WorkflowTemplate_trigger_isActive_nextRunAt_idx" ON "WorkflowTemplate"("trigger", "isActive", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTemplate_id_tenantId_key" ON "WorkflowTemplate"("id", "tenantId");

-- CreateIndex
CREATE INDEX "WorkflowVersion_tenantId_workflowId_idx" ON "WorkflowVersion"("tenantId", "workflowId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowVersion_workflowId_version_key" ON "WorkflowVersion"("workflowId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowVersion_id_tenantId_key" ON "WorkflowVersion"("id", "tenantId");

-- CreateIndex
CREATE INDEX "WorkflowExecution_tenantId_idx" ON "WorkflowExecution"("tenantId");

-- CreateIndex
CREATE INDEX "WorkflowExecution_tenantId_status_idx" ON "WorkflowExecution"("tenantId", "status");

-- CreateIndex
CREATE INDEX "WorkflowExecution_tenantId_status_resumeAt_idx" ON "WorkflowExecution"("tenantId", "status", "resumeAt");

-- CreateIndex
CREATE INDEX "WorkflowExecution_status_resumeAt_idx" ON "WorkflowExecution"("status", "resumeAt");

-- CreateIndex
CREATE INDEX "WorkflowExecution_parentExecId_idx" ON "WorkflowExecution"("parentExecId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowExecution_id_tenantId_key" ON "WorkflowExecution"("id", "tenantId");

-- CreateIndex
CREATE INDEX "WorkflowForkTracker_executionId_forkNodeId_idx" ON "WorkflowForkTracker"("executionId", "forkNodeId");

-- CreateIndex
CREATE INDEX "WorkflowStep_executionId_idx" ON "WorkflowStep"("executionId");

-- CreateIndex
CREATE INDEX "Journey_tenantId_idx" ON "Journey"("tenantId");

-- CreateIndex
CREATE INDEX "Journey_tenantId_status_idx" ON "Journey"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Journey_id_tenantId_key" ON "Journey"("id", "tenantId");

-- CreateIndex
CREATE INDEX "JourneyEnrollment_tenantId_idx" ON "JourneyEnrollment"("tenantId");

-- CreateIndex
CREATE INDEX "JourneyEnrollment_journeyId_status_idx" ON "JourneyEnrollment"("journeyId", "status");

-- CreateIndex
CREATE INDEX "JourneyEnrollment_contactId_idx" ON "JourneyEnrollment"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyEnrollment_journeyId_contactId_key" ON "JourneyEnrollment"("journeyId", "contactId");

-- CreateIndex
CREATE INDEX "CommandJourney_tenantId_idx" ON "CommandJourney"("tenantId");

-- CreateIndex
CREATE INDEX "CommandJourney_tenantId_status_idx" ON "CommandJourney"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CommandJourney_tenantId_entityType_status_idx" ON "CommandJourney"("tenantId", "entityType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CommandJourney_id_tenantId_key" ON "CommandJourney"("id", "tenantId");

-- CreateIndex
CREATE INDEX "CommandJourneyEnrollment_status_resumeAt_idx" ON "CommandJourneyEnrollment"("status", "resumeAt");

-- CreateIndex
CREATE INDEX "CommandJourneyEnrollment_tenantId_journeyId_idx" ON "CommandJourneyEnrollment"("tenantId", "journeyId");

-- CreateIndex
CREATE INDEX "CommandJourneyEnrollment_tenantId_entityType_entityId_idx" ON "CommandJourneyEnrollment"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "CommandJourneyEnrollment_tenantId_journeyId_entityId_key" ON "CommandJourneyEnrollment"("tenantId", "journeyId", "entityId");

-- CreateIndex
CREATE INDEX "AutomationRule_tenantId_module_triggerEvent_idx" ON "AutomationRule"("tenantId", "module", "triggerEvent");

-- CreateIndex
CREATE INDEX "AutomationRule_tenantId_isActive_idx" ON "AutomationRule"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRule_id_tenantId_key" ON "AutomationRule"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledAutomationAction_dedupeKey_key" ON "ScheduledAutomationAction"("dedupeKey");

-- CreateIndex
CREATE INDEX "ScheduledAutomationAction_status_runAt_idx" ON "ScheduledAutomationAction"("status", "runAt");

-- CreateIndex
CREATE INDEX "ScheduledAutomationAction_tenantId_ruleId_idx" ON "ScheduledAutomationAction"("tenantId", "ruleId");

-- CreateIndex
CREATE INDEX "ScheduledAutomationAction_tenantId_module_entityId_idx" ON "ScheduledAutomationAction"("tenantId", "module", "entityId");

-- CreateIndex
CREATE INDEX "DateBasedTrigger_tenantId_ruleId_idx" ON "DateBasedTrigger"("tenantId", "ruleId");

-- CreateIndex
CREATE INDEX "DateBasedTrigger_tenantId_module_isActive_idx" ON "DateBasedTrigger"("tenantId", "module", "isActive");

-- CreateIndex
CREATE INDEX "AutomationRuleVersion_tenantId_ruleId_idx" ON "AutomationRuleVersion"("tenantId", "ruleId");

-- CreateIndex
CREATE INDEX "AutomationRuleVersion_ruleId_version_idx" ON "AutomationRuleVersion"("ruleId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRuleVersion_ruleId_version_key" ON "AutomationRuleVersion"("ruleId", "version");

-- CreateIndex
CREATE INDEX "AutomationRuleRun_tenantId_ruleId_idx" ON "AutomationRuleRun"("tenantId", "ruleId");

-- CreateIndex
CREATE INDEX "AutomationRuleRun_ruleId_ranAt_idx" ON "AutomationRuleRun"("ruleId", "ranAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRuleRun_ruleId_eventId_key" ON "AutomationRuleRun"("ruleId", "eventId");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_createdAt_idx" ON "OutboxMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_aggregateId_idx" ON "OutboxMessage"("aggregateId");

-- CreateIndex
CREATE INDEX "OutboxMessage_tenantId_idx" ON "OutboxMessage"("tenantId");

-- CreateIndex
CREATE INDEX "SlaDefinition_tenantId_idx" ON "SlaDefinition"("tenantId");

-- CreateIndex
CREATE INDEX "SlaDefinition_tenantId_entityType_isActive_idx" ON "SlaDefinition"("tenantId", "entityType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SlaDefinition_id_tenantId_key" ON "SlaDefinition"("id", "tenantId");

-- CreateIndex
CREATE INDEX "SlaBreach_tenantId_idx" ON "SlaBreach"("tenantId");

-- CreateIndex
CREATE INDEX "SlaBreach_tenantId_status_idx" ON "SlaBreach"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SlaBreach_slaId_entityId_idx" ON "SlaBreach"("slaId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "SlaBreach_id_tenantId_key" ON "SlaBreach"("id", "tenantId");

-- CreateIndex
CREATE INDEX "EscalationRule_tenantId_module_isActive_idx" ON "EscalationRule"("tenantId", "module", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "EscalationRule_id_tenantId_key" ON "EscalationRule"("id", "tenantId");

-- CreateIndex
CREATE INDEX "EscalationInstance_status_nextFireAt_idx" ON "EscalationInstance"("status", "nextFireAt");

-- CreateIndex
CREATE INDEX "EscalationInstance_tenantId_module_recordId_idx" ON "EscalationInstance"("tenantId", "module", "recordId");

-- CreateIndex
CREATE INDEX "EscalationInstance_tenantId_ruleId_idx" ON "EscalationInstance"("tenantId", "ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "EscalationInstance_id_tenantId_key" ON "EscalationInstance"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ScoringRule_tenantId_module_isActive_idx" ON "ScoringRule"("tenantId", "module", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringRule_id_tenantId_key" ON "ScoringRule"("id", "tenantId");

-- CreateIndex
CREATE INDEX "RecordScore_tenantId_module_idx" ON "RecordScore"("tenantId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "RecordScore_tenantId_module_recordId_key" ON "RecordScore"("tenantId", "module", "recordId");

-- CreateIndex
CREATE INDEX "ThresholdAlert_tenantId_module_isActive_idx" ON "ThresholdAlert"("tenantId", "module", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ThresholdAlert_id_tenantId_key" ON "ThresholdAlert"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ThresholdAlertState_tenantId_alertId_idx" ON "ThresholdAlertState"("tenantId", "alertId");

-- CreateIndex
CREATE UNIQUE INDEX "ThresholdAlertState_alertId_recordId_key" ON "ThresholdAlertState"("alertId", "recordId");

-- AddForeignKey
ALTER TABLE "WorkflowVersion" ADD CONSTRAINT "WorkflowVersion_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "WorkflowTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowExecution" ADD CONSTRAINT "WorkflowExecution_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "WorkflowTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowExecution" ADD CONSTRAINT "WorkflowExecution_parentExecId_fkey" FOREIGN KEY ("parentExecId") REFERENCES "WorkflowExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowForkTracker" ADD CONSTRAINT "WorkflowForkTracker_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "WorkflowExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "WorkflowExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyEnrollment" ADD CONSTRAINT "JourneyEnrollment_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommandJourneyEnrollment" ADD CONSTRAINT "CommandJourneyEnrollment_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "CommandJourney"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledAutomationAction" ADD CONSTRAINT "ScheduledAutomationAction_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DateBasedTrigger" ADD CONSTRAINT "DateBasedTrigger_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRuleVersion" ADD CONSTRAINT "AutomationRuleVersion_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRuleRun" ADD CONSTRAINT "AutomationRuleRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaBreach" ADD CONSTRAINT "SlaBreach_slaId_fkey" FOREIGN KEY ("slaId") REFERENCES "SlaDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationInstance" ADD CONSTRAINT "EscalationInstance_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "EscalationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThresholdAlertState" ADD CONSTRAINT "ThresholdAlertState_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "ThresholdAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

