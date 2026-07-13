-- CreateTable
CREATE TABLE "Playbook" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pipelineId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Playbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookStage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "stageName" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "entryActions" JSONB NOT NULL DEFAULT '[]',
    "exitCriteria" JSONB NOT NULL DEFAULT '[]',
    "requiredFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "talkingPoints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resources" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "PlaybookStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pipelineId" TEXT,
    "fields" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageTransitionRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "fromStageId" TEXT NOT NULL,
    "toStageId" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageTransitionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlueprintTransition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fromStageId" TEXT NOT NULL,
    "toStageId" TEXT NOT NULL,
    "beforeConditions" JSONB NOT NULL DEFAULT '{}',
    "duringConfig" JSONB NOT NULL DEFAULT '{}',
    "afterActions" JSONB NOT NULL DEFAULT '{}',
    "slaMinutes" INTEGER,
    "escalationConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlueprintTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlueprintRecordState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "currentStageId" TEXT NOT NULL,
    "history" JSONB NOT NULL DEFAULT '[]',
    "slaTransitionId" TEXT,
    "slaDueAt" TIMESTAMP(3),
    "slaBreached" BOOLEAN NOT NULL DEFAULT false,
    "slaBreachedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlueprintRecordState_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "Playbook_tenantId_idx" ON "Playbook"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Playbook_id_tenantId_key" ON "Playbook"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PlaybookStage_playbookId_idx" ON "PlaybookStage"("playbookId");

-- CreateIndex
CREATE INDEX "PlaybookStage_tenantId_idx" ON "PlaybookStage"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaybookStage_playbookId_stageId_key" ON "PlaybookStage"("playbookId", "stageId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaybookStage_id_tenantId_key" ON "PlaybookStage"("id", "tenantId");

-- CreateIndex
CREATE INDEX "DealTemplate_tenantId_idx" ON "DealTemplate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DealTemplate_id_tenantId_key" ON "DealTemplate"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "StageTransitionRule_tenantId_pipelineId_fromStageId_toStage_key" ON "StageTransitionRule"("tenantId", "pipelineId", "fromStageId", "toStageId");

-- CreateIndex
CREATE UNIQUE INDEX "StageTransitionRule_id_tenantId_key" ON "StageTransitionRule"("id", "tenantId");

-- CreateIndex
CREATE INDEX "BlueprintTransition_tenantId_idx" ON "BlueprintTransition"("tenantId");

-- CreateIndex
CREATE INDEX "BlueprintTransition_playbookId_idx" ON "BlueprintTransition"("playbookId");

-- CreateIndex
CREATE INDEX "BlueprintTransition_playbookId_fromStageId_idx" ON "BlueprintTransition"("playbookId", "fromStageId");

-- CreateIndex
CREATE UNIQUE INDEX "BlueprintTransition_id_tenantId_key" ON "BlueprintTransition"("id", "tenantId");

-- CreateIndex
CREATE INDEX "BlueprintRecordState_tenantId_idx" ON "BlueprintRecordState"("tenantId");

-- CreateIndex
CREATE INDEX "BlueprintRecordState_slaBreached_slaDueAt_idx" ON "BlueprintRecordState"("slaBreached", "slaDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "BlueprintRecordState_tenantId_module_recordId_key" ON "BlueprintRecordState"("tenantId", "module", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "BlueprintRecordState_id_tenantId_key" ON "BlueprintRecordState"("id", "tenantId");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_createdAt_idx" ON "OutboxMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_aggregateId_idx" ON "OutboxMessage"("aggregateId");

-- CreateIndex
CREATE INDEX "OutboxMessage_tenantId_idx" ON "OutboxMessage"("tenantId");

-- AddForeignKey
ALTER TABLE "PlaybookStage" ADD CONSTRAINT "PlaybookStage_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "Playbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

