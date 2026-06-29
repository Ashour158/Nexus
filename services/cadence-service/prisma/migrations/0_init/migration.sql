-- CreateEnum
CREATE TYPE "ObjectType" AS ENUM ('CONTACT', 'LEAD');

-- CreateEnum
CREATE TYPE "StepType" AS ENUM ('EMAIL', 'CALL_TASK', 'LINKEDIN_TASK', 'SMS', 'WAIT');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'EXITED');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING', 'EXECUTED', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "CadenceTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "objectType" "ObjectType" NOT NULL DEFAULT 'CONTACT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "exitOnReply" BOOLEAN NOT NULL DEFAULT true,
    "exitOnMeeting" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CadenceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CadenceStep" (
    "id" TEXT NOT NULL,
    "cadenceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "StepType" NOT NULL,
    "delayDays" INTEGER NOT NULL DEFAULT 0,
    "subject" TEXT,
    "body" TEXT,
    "taskTitle" TEXT,
    "variantB" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CadenceStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CadenceEnrollment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cadenceId" TEXT NOT NULL,
    "objectType" "ObjectType" NOT NULL,
    "objectId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitReason" TEXT,
    "exitedAt" TIMESTAMP(3),

    CONSTRAINT "CadenceEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepExecution" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "stepPosition" INTEGER NOT NULL,
    "stepType" "StepType" NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3),
    "result" TEXT,
    "variant" TEXT NOT NULL DEFAULT 'A',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StepExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxMessage" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "aggregateId" TEXT,
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
CREATE INDEX "CadenceTemplate_tenantId_idx" ON "CadenceTemplate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CadenceTemplate_id_tenantId_key" ON "CadenceTemplate"("id", "tenantId");

-- CreateIndex
CREATE INDEX "CadenceStep_cadenceId_idx" ON "CadenceStep"("cadenceId");

-- CreateIndex
CREATE INDEX "CadenceEnrollment_tenantId_status_idx" ON "CadenceEnrollment"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CadenceEnrollment_tenantId_cadenceId_objectId_key" ON "CadenceEnrollment"("tenantId", "cadenceId", "objectId");

-- CreateIndex
CREATE UNIQUE INDEX "CadenceEnrollment_id_tenantId_key" ON "CadenceEnrollment"("id", "tenantId");

-- CreateIndex
CREATE INDEX "StepExecution_enrollmentId_idx" ON "StepExecution"("enrollmentId");

-- CreateIndex
CREATE INDEX "StepExecution_status_scheduledAt_idx" ON "StepExecution"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_createdAt_idx" ON "OutboxMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_aggregateId_idx" ON "OutboxMessage"("aggregateId");

-- AddForeignKey
ALTER TABLE "CadenceStep" ADD CONSTRAINT "CadenceStep_cadenceId_fkey" FOREIGN KEY ("cadenceId") REFERENCES "CadenceTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadenceEnrollment" ADD CONSTRAINT "CadenceEnrollment_cadenceId_fkey" FOREIGN KEY ("cadenceId") REFERENCES "CadenceTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepExecution" ADD CONSTRAINT "StepExecution_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "CadenceEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
