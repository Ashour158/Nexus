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

-- CreateIndex
CREATE INDEX "Playbook_tenantId_idx" ON "Playbook"("tenantId");

-- CreateIndex
CREATE INDEX "PlaybookStage_playbookId_idx" ON "PlaybookStage"("playbookId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaybookStage_playbookId_stageId_key" ON "PlaybookStage"("playbookId", "stageId");

-- CreateIndex
CREATE INDEX "PlaybookStage_tenantId_idx" ON "PlaybookStage"("tenantId");

-- CreateIndex
CREATE INDEX "DealTemplate_tenantId_idx" ON "DealTemplate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "StageTransitionRule_tenantId_pipelineId_fromStageId_toStageId_key" ON "StageTransitionRule"("tenantId", "pipelineId", "fromStageId", "toStageId");

-- AddForeignKey
ALTER TABLE "PlaybookStage" ADD CONSTRAINT "PlaybookStage_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "Playbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
