-- CreateTable
CREATE TABLE "WorkflowForkTracker" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "forkNodeId" TEXT NOT NULL,
    "joinNodeId" TEXT NOT NULL,
    "branchNodeIds" TEXT[],
    "completedIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowForkTracker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowForkTracker_executionId_forkNodeId_idx" ON "WorkflowForkTracker"("executionId", "forkNodeId");

-- AddForeignKey
ALTER TABLE "WorkflowForkTracker" ADD CONSTRAINT "WorkflowForkTracker_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "WorkflowExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "WorkflowExecution" ADD COLUMN "parentForkId" TEXT,
ADD COLUMN "parentExecId" TEXT;

-- CreateIndex
CREATE INDEX "WorkflowExecution_parentExecId_idx" ON "WorkflowExecution"("parentExecId");

-- AddForeignKey
ALTER TABLE "WorkflowExecution" ADD CONSTRAINT "WorkflowExecution_parentExecId_fkey" FOREIGN KEY ("parentExecId") REFERENCES "WorkflowExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
