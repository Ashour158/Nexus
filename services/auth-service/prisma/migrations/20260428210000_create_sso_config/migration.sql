-- CreateTable
CREATE TABLE IF NOT EXISTS "SsoConfiguration" (
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'saml',
    "entryPoint" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "certificate" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SsoConfiguration_pkey" PRIMARY KEY ("tenantId")
);

-- CreateIndex
CREATE UNIQUE INDEX "SsoConfiguration_tenantId_provider_key" ON "SsoConfiguration"("tenantId", "provider");
