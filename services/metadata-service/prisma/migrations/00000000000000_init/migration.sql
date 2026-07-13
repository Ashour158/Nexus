-- CreateTable
CREATE TABLE "CustomFieldDefinition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "config" JSONB,
    "globalSetId" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "showOnCard" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalPicklistSet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalPicklistSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldPermission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "allowedRoles" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "condition" JSONB NOT NULL,
    "requirement" JSONB NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldChangeLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedBy" TEXT NOT NULL,
    "changedByName" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "masterRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "DuplicateGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6B7280',
    "entityType" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateRecord" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isMaster" BOOLEAN NOT NULL DEFAULT false,
    "snapshot" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "DuplicateRecord_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "CodingRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "pattern" TEXT NOT NULL,
    "separator" TEXT NOT NULL DEFAULT '-',
    "sequenceScope" TEXT NOT NULL DEFAULT 'TENANT',
    "resetPolicy" TEXT NOT NULL DEFAULT 'NEVER',
    "nextSequence" INTEGER NOT NULL DEFAULT 1,
    "isManualOverrideAllowed" BOOLEAN NOT NULL DEFAULT false,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "lockedAfterCreate" BOOLEAN NOT NULL DEFAULT true,
    "fallbackStrategy" TEXT NOT NULL DEFAULT 'USE_DEFAULT',
    "effectiveFrom" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodingRuleVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codingRuleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "pattern" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "separator" TEXT NOT NULL,
    "sequenceScope" TEXT NOT NULL,
    "resetPolicy" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodingRuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodingSequence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,
    "resetAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodingSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomModule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "apiName" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "pluralLabel" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomModuleField" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "apiName" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "unique" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "formula" TEXT,
    "lookupModule" TEXT,
    "defaultValue" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomModuleField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomModuleLayout" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sections" JSONB NOT NULL DEFAULT '[]',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomModuleLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "rollout" INTEGER NOT NULL DEFAULT 0,
    "tenants" JSONB NOT NULL DEFAULT '[]',
    "users" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT NOT NULL DEFAULT 'system',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageLayout" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "assignedProfiles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sections" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LayoutRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "layoutId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerField" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "triggerValue" JSONB,
    "actions" JSONB NOT NULL DEFAULT '[]',
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LayoutRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelatedListConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relatedModule" TEXT NOT NULL,
    "displayFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortBy" TEXT,
    "visibleToProfiles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelatedListConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigImportLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bundleVersion" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "conflict" TEXT NOT NULL,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfigImportLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabelTranslation" (
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

-- CreateTable
CREATE TABLE "CodingAllocationLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "allocatedBy" TEXT NOT NULL,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isManualOverride" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CodingAllocationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomButton" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "icon" TEXT,
    "placement" TEXT NOT NULL DEFAULT 'RECORD',
    "actionType" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "visibilityRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confirmRequired" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomButton_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomFieldDefinition_tenantId_entityType_idx" ON "CustomFieldDefinition"("tenantId", "entityType");

-- CreateIndex
CREATE INDEX "CustomFieldDefinition_globalSetId_idx" ON "CustomFieldDefinition"("globalSetId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDefinition_tenantId_entityType_apiKey_key" ON "CustomFieldDefinition"("tenantId", "entityType", "apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDefinition_id_tenantId_key" ON "CustomFieldDefinition"("id", "tenantId");

-- CreateIndex
CREATE INDEX "GlobalPicklistSet_tenantId_idx" ON "GlobalPicklistSet"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalPicklistSet_tenantId_name_key" ON "GlobalPicklistSet"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalPicklistSet_id_tenantId_key" ON "GlobalPicklistSet"("id", "tenantId");

-- CreateIndex
CREATE INDEX "FieldPermission_tenantId_objectType_idx" ON "FieldPermission"("tenantId", "objectType");

-- CreateIndex
CREATE UNIQUE INDEX "FieldPermission_tenantId_objectType_fieldName_key" ON "FieldPermission"("tenantId", "objectType", "fieldName");

-- CreateIndex
CREATE UNIQUE INDEX "FieldPermission_id_tenantId_key" ON "FieldPermission"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ValidationRule_tenantId_objectType_idx" ON "ValidationRule"("tenantId", "objectType");

-- CreateIndex
CREATE UNIQUE INDEX "ValidationRule_id_tenantId_key" ON "ValidationRule"("id", "tenantId");

-- CreateIndex
CREATE INDEX "FieldChangeLog_tenantId_objectType_objectId_idx" ON "FieldChangeLog"("tenantId", "objectType", "objectId");

-- CreateIndex
CREATE INDEX "FieldChangeLog_tenantId_changedAt_idx" ON "FieldChangeLog"("tenantId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FieldChangeLog_id_tenantId_key" ON "FieldChangeLog"("id", "tenantId");

-- CreateIndex
CREATE INDEX "DuplicateGroup_tenantId_entityType_status_idx" ON "DuplicateGroup"("tenantId", "entityType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateGroup_id_tenantId_key" ON "DuplicateGroup"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Tag_tenantId_idx" ON "Tag"("tenantId");

-- CreateIndex
CREATE INDEX "Tag_tenantId_entityType_idx" ON "Tag"("tenantId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_tenantId_name_key" ON "Tag"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_id_tenantId_key" ON "Tag"("id", "tenantId");

-- CreateIndex
CREATE INDEX "DuplicateRecord_groupId_idx" ON "DuplicateRecord"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateRecord_groupId_recordId_key" ON "DuplicateRecord"("groupId", "recordId");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_createdAt_idx" ON "OutboxMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_aggregateId_idx" ON "OutboxMessage"("aggregateId");

-- CreateIndex
CREATE INDEX "OutboxMessage_tenantId_idx" ON "OutboxMessage"("tenantId");

-- CreateIndex
CREATE INDEX "CodingRule_tenantId_entityType_idx" ON "CodingRule"("tenantId", "entityType");

-- CreateIndex
CREATE INDEX "CodingRule_tenantId_isActive_idx" ON "CodingRule"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CodingRule_tenantId_entityType_isActive_effectiveFrom_key" ON "CodingRule"("tenantId", "entityType", "isActive", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "CodingRule_id_tenantId_key" ON "CodingRule"("id", "tenantId");

-- CreateIndex
CREATE INDEX "CodingRuleVersion_tenantId_codingRuleId_idx" ON "CodingRuleVersion"("tenantId", "codingRuleId");

-- CreateIndex
CREATE UNIQUE INDEX "CodingRuleVersion_id_tenantId_key" ON "CodingRuleVersion"("id", "tenantId");

-- CreateIndex
CREATE INDEX "CodingSequence_tenantId_entityType_idx" ON "CodingSequence"("tenantId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "CodingSequence_tenantId_entityType_scopeKey_key" ON "CodingSequence"("tenantId", "entityType", "scopeKey");

-- CreateIndex
CREATE INDEX "CustomModule_tenantId_idx" ON "CustomModule"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomModule_tenantId_apiName_key" ON "CustomModule"("tenantId", "apiName");

-- CreateIndex
CREATE UNIQUE INDEX "CustomModule_id_tenantId_key" ON "CustomModule"("id", "tenantId");

-- CreateIndex
CREATE INDEX "CustomModuleField_tenantId_moduleId_idx" ON "CustomModuleField"("tenantId", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomModuleField_tenantId_moduleId_apiName_key" ON "CustomModuleField"("tenantId", "moduleId", "apiName");

-- CreateIndex
CREATE UNIQUE INDEX "CustomModuleField_id_tenantId_key" ON "CustomModuleField"("id", "tenantId");

-- CreateIndex
CREATE INDEX "CustomModuleLayout_tenantId_moduleId_idx" ON "CustomModuleLayout"("tenantId", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomModuleLayout_id_tenantId_key" ON "CustomModuleLayout"("id", "tenantId");

-- CreateIndex
CREATE INDEX "CustomRecord_tenantId_moduleId_idx" ON "CustomRecord"("tenantId", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomRecord_id_tenantId_key" ON "CustomRecord"("id", "tenantId");

-- CreateIndex
CREATE INDEX "FeatureFlag_tenantId_idx" ON "FeatureFlag"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_tenantId_key_key" ON "FeatureFlag"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_id_tenantId_key" ON "FeatureFlag"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PageLayout_tenantId_module_idx" ON "PageLayout"("tenantId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "PageLayout_id_tenantId_key" ON "PageLayout"("id", "tenantId");

-- CreateIndex
CREATE INDEX "LayoutRule_tenantId_layoutId_idx" ON "LayoutRule"("tenantId", "layoutId");

-- CreateIndex
CREATE UNIQUE INDEX "LayoutRule_id_tenantId_key" ON "LayoutRule"("id", "tenantId");

-- CreateIndex
CREATE INDEX "RelatedListConfig_tenantId_module_idx" ON "RelatedListConfig"("tenantId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "RelatedListConfig_id_tenantId_key" ON "RelatedListConfig"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ConfigImportLog_tenantId_createdAt_idx" ON "ConfigImportLog"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigImportLog_id_tenantId_key" ON "ConfigImportLog"("id", "tenantId");

-- CreateIndex
CREATE INDEX "LabelTranslation_tenantId_locale_idx" ON "LabelTranslation"("tenantId", "locale");

-- CreateIndex
CREATE INDEX "LabelTranslation_tenantId_entityType_locale_idx" ON "LabelTranslation"("tenantId", "entityType", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "LabelTranslation_tenantId_entityType_entityKey_locale_key" ON "LabelTranslation"("tenantId", "entityType", "entityKey", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "LabelTranslation_id_tenantId_key" ON "LabelTranslation"("id", "tenantId");

-- CreateIndex
CREATE INDEX "CodingAllocationLog_tenantId_entityType_entityId_idx" ON "CodingAllocationLog"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "CodingAllocationLog_tenantId_code_idx" ON "CodingAllocationLog"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CodingAllocationLog_tenantId_entityType_code_key" ON "CodingAllocationLog"("tenantId", "entityType", "code");

-- CreateIndex
CREATE INDEX "CustomButton_tenantId_module_placement_idx" ON "CustomButton"("tenantId", "module", "placement");

-- CreateIndex
CREATE INDEX "CustomButton_tenantId_module_isActive_idx" ON "CustomButton"("tenantId", "module", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CustomButton_id_tenantId_key" ON "CustomButton"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "CustomFieldDefinition" ADD CONSTRAINT "CustomFieldDefinition_globalSetId_fkey" FOREIGN KEY ("globalSetId") REFERENCES "GlobalPicklistSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateRecord" ADD CONSTRAINT "DuplicateRecord_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "DuplicateGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LayoutRule" ADD CONSTRAINT "LayoutRule_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "PageLayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

