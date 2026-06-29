-- CreateTable
CREATE TABLE "DealStakeholder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "influence" INTEGER NOT NULL DEFAULT 50,
    "sentiment" TEXT NOT NULL DEFAULT 'Neutral',
    "reportsToId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealStakeholder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealRoom" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "buyerEmails" JSONB NOT NULL DEFAULT '[]',
    "lastViewedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MutualActionItem" (
    "id" TEXT NOT NULL,
    "dealRoomId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "owner" TEXT NOT NULL,
    "ownerName" TEXT,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MutualActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealRoomDocument" (
    "id" TEXT NOT NULL,
    "dealRoomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileType" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealRoomDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DealStakeholder_dealId_contactId_key" ON "DealStakeholder"("dealId", "contactId");

-- CreateIndex
CREATE INDEX "DealStakeholder_tenantId_dealId_idx" ON "DealStakeholder"("tenantId", "dealId");

-- AddForeignKey
ALTER TABLE "DealStakeholder" ADD CONSTRAINT "DealStakeholder_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStakeholder" ADD CONSTRAINT "DealStakeholder_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStakeholder" ADD CONSTRAINT "DealStakeholder_reportsToId_fkey" FOREIGN KEY ("reportsToId") REFERENCES "DealStakeholder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "DealRoom_dealId_key" ON "DealRoom"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "DealRoom_slug_key" ON "DealRoom"("slug");

-- CreateIndex
CREATE INDEX "DealRoom_tenantId_idx" ON "DealRoom"("tenantId");

-- AddForeignKey
ALTER TABLE "DealRoom" ADD CONSTRAINT "DealRoom_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "MutualActionItem_dealRoomId_idx" ON "MutualActionItem"("dealRoomId");

-- AddForeignKey
ALTER TABLE "MutualActionItem" ADD CONSTRAINT "MutualActionItem_dealRoomId_fkey" FOREIGN KEY ("dealRoomId") REFERENCES "DealRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "DealRoomDocument_dealRoomId_idx" ON "DealRoomDocument"("dealRoomId");

-- AddForeignKey
ALTER TABLE "DealRoomDocument" ADD CONSTRAINT "DealRoomDocument_dealRoomId_fkey" FOREIGN KEY ("dealRoomId") REFERENCES "DealRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
