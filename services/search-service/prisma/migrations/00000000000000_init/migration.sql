-- CreateTable
CREATE TABLE "SavedSearch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "entityType" TEXT,
    "filters" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecentSearch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "entityType" TEXT,
    "searchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecentSearch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedSearch_tenantId_userId_createdAt_idx" ON "SavedSearch"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "RecentSearch_tenantId_userId_searchedAt_idx" ON "RecentSearch"("tenantId", "userId", "searchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecentSearch_tenantId_userId_query_key" ON "RecentSearch"("tenantId", "userId", "query");

