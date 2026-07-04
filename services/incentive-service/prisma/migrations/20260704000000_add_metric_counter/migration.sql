-- CreateTable
CREATE TABLE "MetricCounter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lastEventDate" TEXT,
    "streakValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetricCounter_tenantId_ownerId_idx" ON "MetricCounter"("tenantId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "MetricCounter_tenantId_ownerId_metric_key" ON "MetricCounter"("tenantId", "ownerId", "metric");
