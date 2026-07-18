-- Config-as-data (export/import) audit log + label localization.

CREATE TABLE IF NOT EXISTS "ConfigImportLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bundleVersion" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "conflict" TEXT NOT NULL,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConfigImportLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ConfigImportLog_tenantId_createdAt_idx" ON "ConfigImportLog"("tenantId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ConfigImportLog_id_tenantId_key" ON "ConfigImportLog"("id", "tenantId");

CREATE TABLE IF NOT EXISTS "LabelTranslation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LabelTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LabelTranslation_tenantId_entityType_entityKey_locale_key" ON "LabelTranslation"("tenantId", "entityType", "entityKey", "locale");
CREATE INDEX IF NOT EXISTS "LabelTranslation_tenantId_locale_idx" ON "LabelTranslation"("tenantId", "locale");
CREATE INDEX IF NOT EXISTS "LabelTranslation_tenantId_entityType_locale_idx" ON "LabelTranslation"("tenantId", "entityType", "locale");
CREATE UNIQUE INDEX IF NOT EXISTS "LabelTranslation_id_tenantId_key" ON "LabelTranslation"("id", "tenantId");
