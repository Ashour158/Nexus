-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('MANUAL', 'IMPORT', 'WEB_FORM', 'EMAIL_CAMPAIGN', 'SOCIAL_MEDIA', 'PAID_ADS', 'REFERRAL', 'PARTNER', 'CHAT', 'EVENT', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'ASSIGNED', 'WORKING', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "LeadRating" AS ENUM ('HOT', 'WARM', 'COLD');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('PROSPECT', 'CUSTOMER', 'PARTNER', 'COMPETITOR', 'RESELLER', 'OTHER');

-- CreateEnum
CREATE TYPE "AccountTier" AS ENUM ('STRATEGIC', 'ENTERPRISE', 'MID_MARKET', 'SMB');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'AT_RISK', 'CHURNED');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('OPEN', 'WON', 'LOST', 'DORMANT');

-- CreateEnum
CREATE TYPE "ForecastCategory" AS ENUM ('PIPELINE', 'BEST_CASE', 'COMMIT', 'CLOSED', 'OMITTED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'TASK', 'DEMO', 'LUNCH', 'CONFERENCE', 'FOLLOW_UP', 'PROPOSAL', 'NEGOTIATION', 'NOTE');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DEFERRED');

-- CreateEnum
CREATE TYPE "ActivityPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "EnrichmentStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "jobTitle" TEXT,
    "source" "LeadSource" NOT NULL DEFAULT 'MANUAL',
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "score" INTEGER NOT NULL DEFAULT 0,
    "rating" "LeadRating" NOT NULL DEFAULT 'COLD',
    "industry" TEXT,
    "website" TEXT,
    "annualRevenue" DECIMAL(18,2),
    "employeeCount" INTEGER,
    "country" TEXT,
    "city" TEXT,
    "address" TEXT,
    "linkedInUrl" TEXT,
    "twitterHandle" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "convertedAt" TIMESTAMP(3),
    "convertedToId" TEXT,
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "tags" TEXT[],
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "gdprConsent" BOOLEAN NOT NULL DEFAULT false,
    "gdprConsentAt" TIMESTAMP(3),
    "territoryId" TEXT,
    "assignedTo" TEXT,
    "priority" TEXT DEFAULT 'medium',
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deletedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dataQualityScore" INTEGER,
    "aiConversionProbability" DOUBLE PRECISION,
    "aiScore" INTEGER,
    "aiInsights" JSONB,
    "aiScoredAt" TIMESTAMP(3),

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "emailHash" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "jobTitle" TEXT,
    "department" TEXT,
    "linkedInUrl" TEXT,
    "twitterHandle" TEXT,
    "country" TEXT,
    "city" TEXT,
    "address" TEXT,
    "timezone" TEXT,
    "preferredChannel" TEXT,
    "doNotEmail" BOOLEAN NOT NULL DEFAULT false,
    "doNotCall" BOOLEAN NOT NULL DEFAULT false,
    "gdprConsent" BOOLEAN NOT NULL DEFAULT false,
    "gdprConsentAt" TIMESTAMP(3),
    "lastContactedAt" TIMESTAMP(3),
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "tags" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "dataQualityScore" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deletedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactEmail" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'work',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactAddress" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'work',
    "street" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "source" TEXT,
    "ipAddress" TEXT,
    "notes" TEXT,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountContactRelation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isDirect" BOOLEAN NOT NULL DEFAULT true,
    "influence" TEXT,
    "sentiment" TEXT,
    "reportsToContactId" TEXT,
    "isChampion" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountContactRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "parentAccountId" TEXT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "tradeName" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "fax" TEXT,
    "email" TEXT,
    "industry" TEXT,
    "subIndustry" TEXT,
    "type" "AccountType" NOT NULL DEFAULT 'PROSPECT',
    "tier" "AccountTier" NOT NULL DEFAULT 'SMB',
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "lifecycleStage" TEXT,
    "annualRevenue" DECIMAL(18,2),
    "employeeCount" INTEGER,
    "foundedYear" INTEGER,
    "country" TEXT,
    "city" TEXT,
    "address" TEXT,
    "zipCode" TEXT,
    "linkedInUrl" TEXT,
    "description" TEXT,
    "sicCode" TEXT,
    "naicsCode" TEXT,
    "taxId" TEXT,
    "vatNumber" TEXT,
    "commercialRegistrationNumber" TEXT,
    "paymentTerms" TEXT,
    "creditLimit" DECIMAL(18,2),
    "currency" TEXT DEFAULT 'USD',
    "priceBookId" TEXT,
    "territoryId" TEXT,
    "healthScore" INTEGER,
    "npsScore" INTEGER,
    "riskLevel" TEXT,
    "lastActivityAt" TIMESTAMP(3),
    "billingAddressLine1" TEXT,
    "billingAddressLine2" TEXT,
    "billingCity" TEXT,
    "billingState" TEXT,
    "billingPostalCode" TEXT,
    "billingCountry" TEXT,
    "billingLatitude" DOUBLE PRECISION,
    "billingLongitude" DOUBLE PRECISION,
    "shippingAddressLine1" TEXT,
    "shippingAddressLine2" TEXT,
    "shippingCity" TEXT,
    "shippingState" TEXT,
    "shippingPostalCode" TEXT,
    "shippingCountry" TEXT,
    "shippingLatitude" DOUBLE PRECISION,
    "shippingLongitude" DOUBLE PRECISION,
    "shippingInstructions" TEXT,
    "sameAsBilling" BOOLEAN NOT NULL DEFAULT false,
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "tags" TEXT[],
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deletedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dataQualityScore" INTEGER,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "probability" INTEGER NOT NULL DEFAULT 0,
    "expectedCloseDate" TIMESTAMP(3),
    "actualCloseDate" TIMESTAMP(3),
    "status" "DealStatus" NOT NULL DEFAULT 'OPEN',
    "lostReason" TEXT,
    "lostDetail" TEXT,
    "forecastCategory" "ForecastCategory" NOT NULL DEFAULT 'PIPELINE',
    "meddicicScore" INTEGER NOT NULL DEFAULT 0,
    "meddicicData" JSONB NOT NULL DEFAULT '{}',
    "competitors" TEXT[],
    "source" TEXT,
    "campaignId" TEXT,
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "tags" TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deletedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closeReason" TEXT,
    "dataQualityScore" INTEGER,
    "aiWinProbability" DOUBLE PRECISION,
    "aiScore" INTEGER,
    "aiInsights" JSONB,
    "aiScoredAt" TIMESTAMP(3),
    "contractEndDate" TIMESTAMP(3),
    "renewalProbability" INTEGER,
    "isRenewal" BOOLEAN NOT NULL DEFAULT false,
    "renewedFromDealId" TEXT,
    "mrr" DECIMAL(18,2),
    "arr" DECIMAL(18,2),
    "territoryId" TEXT,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quota" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "teamId" TEXT,
    "territoryId" TEXT,
    "period" TEXT NOT NULL,
    "target" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DealContact_pkey" PRIMARY KEY ("id")
);

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
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealStakeholder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealProduct" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealTeam" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "splitPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "splitType" TEXT NOT NULL DEFAULT 'revenue',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealTeam_pkey" PRIMARY KEY ("id")
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
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MutualActionItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealRoomId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "owner" TEXT NOT NULL,
    "ownerName" TEXT,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MutualActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealRoomDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealRoomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileType" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealRoomDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pipeline" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'sales',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "ownedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "rottenDays" INTEGER NOT NULL DEFAULT 30,
    "requiredFields" JSONB NOT NULL DEFAULT '[]',
    "entryConditions" JSONB NOT NULL DEFAULT '[]',
    "color" TEXT NOT NULL DEFAULT '#6B7280',
    "isWon" BOOLEAN NOT NULL DEFAULT false,
    "isLost" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "WinLossReason" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pipelineId" TEXT,
    "type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WinLossReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldPermission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT true,
    "canEdit" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
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
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingChange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerComment" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewProcessConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "fields" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewProcessConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgWideDefault" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "accessLevel" TEXT NOT NULL,
    "grantHierarchyAccess" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgWideDefault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharingRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceValue" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetValue" TEXT NOT NULL,
    "accessLevel" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualShare" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "granteeType" TEXT NOT NULL,
    "granteeId" TEXT NOT NULL,
    "accessLevel" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordLock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "reason" TEXT,
    "lockedBy" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlockedAt" TIMESTAMP(3),

    CONSTRAINT "RecordLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "criteria" JSONB,
    "assigneePool" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "status" "ActivityStatus" NOT NULL DEFAULT 'PLANNED',
    "priority" "ActivityPriority" NOT NULL DEFAULT 'NORMAL',
    "dueDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "duration" INTEGER,
    "outcome" TEXT,
    "leadId" TEXT,
    "contactId" TEXT,
    "accountId" TEXT,
    "dealId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "location" TEXT,
    "videoLink" TEXT,
    "recurrence" TEXT,
    "attendees" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reminderMinutes" INTEGER,
    "externalCalendarEventId" TEXT,
    "externalCalendarProvider" TEXT,
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "leadId" TEXT,
    "contactId" TEXT,
    "accountId" TEXT,
    "dealId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "validUntil" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "approvalStatus" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "terms" TEXT,
    "notes" TEXT,
    "lineItems" JSONB NOT NULL DEFAULT '[]',
    "deletedAt" TIMESTAMP(3),
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteProjection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "accountId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "rfqId" TEXT,
    "quoteNumber" TEXT,
    "status" TEXT NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "currentRevisionId" TEXT,
    "validUntil" TIMESTAMP(3),
    "lastFinanceEventType" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "sourceEventVersion" INTEGER NOT NULL DEFAULT 1,
    "sourceAggregateId" TEXT,
    "sourceAggregateType" TEXT,
    "correlationId" TEXT,
    "transitionLedgerId" TEXT,
    "projectionVersion" INTEGER NOT NULL DEFAULT 1,
    "projectedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteProjection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteProjectionEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "sourceEventVersion" INTEGER NOT NULL DEFAULT 1,
    "financeEventType" TEXT NOT NULL,
    "sourceAggregateId" TEXT,
    "sourceAggregateType" TEXT,
    "correlationId" TEXT,
    "transitionLedgerId" TEXT,
    "projectionVersion" INTEGER NOT NULL DEFAULT 1,
    "projectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteProjectionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailThread" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT,
    "accountId" TEXT,
    "externalId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "messageCount" INTEGER NOT NULL DEFAULT 1,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "snippet" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "toEmails" TEXT[],
    "ccEmails" TEXT[],
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "bodyText" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "direction" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldDefinition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "showOnCard" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id")
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
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DuplicateGroup_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "DuplicateRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "matchFields" TEXT[],
    "matchType" TEXT NOT NULL DEFAULT 'EXACT',
    "threshold" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DuplicateRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateCandidate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "recordIds" TEXT[],
    "ruleId" TEXT,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuplicateCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadScore" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "tier" TEXT NOT NULL DEFAULT 'cold',
    "signals" JSONB NOT NULL DEFAULT '{}',
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidence" DOUBLE PRECISION,
    "deletedAt" TIMESTAMP(3),
    "routingDecision" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountHealthScore" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "riskLevel" TEXT NOT NULL DEFAULT 'low',
    "churnProbability" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "signals" JSONB NOT NULL DEFAULT '{}',
    "lastActivityDays" INTEGER,
    "openDealsCount" INTEGER NOT NULL DEFAULT 0,
    "wonDealsCount" INTEGER NOT NULL DEFAULT 0,
    "lostDealsCount" INTEGER NOT NULL DEFAULT 0,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountHealthScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadScoringRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "signal" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "condition" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadScoringRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiModel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "coefficients" JSONB NOT NULL DEFAULT '{}',
    "featureMeans" JSONB,
    "featureStds" JSONB,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "metrics" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "trainedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrichmentJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" "EnrichmentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'clearbit',
    "confidence" DOUBLE PRECISION,
    "rawData" JSONB,
    "appliedFields" JSONB NOT NULL DEFAULT '{}',
    "errorMessage" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrichmentJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "description" TEXT,
    "strengths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "weaknesses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "winRateAgainst" DOUBLE PRECISION,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealCompetitor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "outcome" TEXT,
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealCompetitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Territory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "states" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "postalCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "industries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minCompanySize" INTEGER,
    "maxCompanySize" INTEGER,
    "minRevenue" DECIMAL(18,2),
    "maxRevenue" DECIMAL(18,2),
    "assignmentMode" TEXT NOT NULL DEFAULT 'manual',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Territory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesRep" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "territoryId" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 10,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "totalLeads" INTEGER NOT NULL DEFAULT 0,
    "activeLeads" INTEGER NOT NULL DEFAULT 0,
    "wonDeals" INTEGER NOT NULL DEFAULT 0,
    "lostDeals" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesRep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadRoutingEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "territoryId" TEXT NOT NULL,
    "salesRepId" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "reason" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "alternativeRoutes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LeadRoutingEvent_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordFollower" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordFollower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "columns" JSONB,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_tenantId_idx" ON "Lead"("tenantId");

-- CreateIndex
CREATE INDEX "Lead_tenantId_status_idx" ON "Lead"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Lead_tenantId_ownerId_idx" ON "Lead"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "Lead_tenantId_email_idx" ON "Lead"("tenantId", "email");

-- CreateIndex
CREATE INDEX "Lead_tenantId_createdAt_idx" ON "Lead"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_tenantId_updatedAt_idx" ON "Lead"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "Lead_territoryId_idx" ON "Lead"("territoryId");

-- CreateIndex
CREATE INDEX "Lead_assignedTo_idx" ON "Lead"("assignedTo");

-- CreateIndex
CREATE INDEX "Lead_priority_idx" ON "Lead"("priority");

-- CreateIndex
CREATE INDEX "Lead_tenantId_deletedAt_idx" ON "Lead"("tenantId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_id_tenantId_key" ON "Lead"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Contact_tenantId_idx" ON "Contact"("tenantId");

-- CreateIndex
CREATE INDEX "Contact_tenantId_accountId_idx" ON "Contact"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "Contact_tenantId_ownerId_idx" ON "Contact"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "Contact_tenantId_isActive_idx" ON "Contact"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "Contact_tenantId_createdAt_idx" ON "Contact"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Contact_tenantId_updatedAt_idx" ON "Contact"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "Contact_tenantId_email_idx" ON "Contact"("tenantId", "email");

-- CreateIndex
CREATE INDEX "Contact_tenantId_deletedAt_idx" ON "Contact"("tenantId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_tenantId_emailHash_key" ON "Contact"("tenantId", "emailHash");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_id_tenantId_key" ON "Contact"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ContactEmail_contactId_idx" ON "ContactEmail"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactEmail_contactId_email_key" ON "ContactEmail"("contactId", "email");

-- CreateIndex
CREATE INDEX "ContactAddress_contactId_idx" ON "ContactAddress"("contactId");

-- CreateIndex
CREATE INDEX "ConsentRecord_tenantId_contactId_idx" ON "ConsentRecord"("tenantId", "contactId");

-- CreateIndex
CREATE INDEX "ConsentRecord_tenantId_status_idx" ON "ConsentRecord"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentRecord_tenantId_contactId_channel_key" ON "ConsentRecord"("tenantId", "contactId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentRecord_id_tenantId_key" ON "ConsentRecord"("id", "tenantId");

-- CreateIndex
CREATE INDEX "AccountContactRelation_tenantId_accountId_idx" ON "AccountContactRelation"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "AccountContactRelation_tenantId_contactId_idx" ON "AccountContactRelation"("tenantId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountContactRelation_tenantId_accountId_contactId_key" ON "AccountContactRelation"("tenantId", "accountId", "contactId");

-- CreateIndex
CREATE INDEX "Account_tenantId_idx" ON "Account"("tenantId");

-- CreateIndex
CREATE INDEX "Account_tenantId_type_idx" ON "Account"("tenantId", "type");

-- CreateIndex
CREATE INDEX "Account_tenantId_ownerId_idx" ON "Account"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "Account_tenantId_createdAt_idx" ON "Account"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Account_tenantId_updatedAt_idx" ON "Account"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "Account_tenantId_parentAccountId_idx" ON "Account"("tenantId", "parentAccountId");

-- CreateIndex
CREATE INDEX "Account_tenantId_code_idx" ON "Account"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Account_tenantId_taxId_idx" ON "Account"("tenantId", "taxId");

-- CreateIndex
CREATE INDEX "Account_tenantId_vatNumber_idx" ON "Account"("tenantId", "vatNumber");

-- CreateIndex
CREATE INDEX "Account_tenantId_deletedAt_idx" ON "Account"("tenantId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Account_id_tenantId_key" ON "Account"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Deal_tenantId_idx" ON "Deal"("tenantId");

-- CreateIndex
CREATE INDEX "Deal_tenantId_pipelineId_stageId_idx" ON "Deal"("tenantId", "pipelineId", "stageId");

-- CreateIndex
CREATE INDEX "Deal_tenantId_ownerId_idx" ON "Deal"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "Deal_tenantId_status_idx" ON "Deal"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Deal_tenantId_createdAt_idx" ON "Deal"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Deal_tenantId_updatedAt_idx" ON "Deal"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "Deal_tenantId_isRenewal_idx" ON "Deal"("tenantId", "isRenewal");

-- CreateIndex
CREATE INDEX "Deal_tenantId_contractEndDate_idx" ON "Deal"("tenantId", "contractEndDate");

-- CreateIndex
CREATE INDEX "Deal_tenantId_renewedFromDealId_idx" ON "Deal"("tenantId", "renewedFromDealId");

-- CreateIndex
CREATE INDEX "Deal_tenantId_territoryId_idx" ON "Deal"("tenantId", "territoryId");

-- CreateIndex
CREATE INDEX "Deal_tenantId_deletedAt_idx" ON "Deal"("tenantId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_id_tenantId_key" ON "Deal"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Quota_tenantId_idx" ON "Quota"("tenantId");

-- CreateIndex
CREATE INDEX "Quota_tenantId_period_idx" ON "Quota"("tenantId", "period");

-- CreateIndex
CREATE INDEX "Quota_tenantId_userId_period_idx" ON "Quota"("tenantId", "userId", "period");

-- CreateIndex
CREATE INDEX "Quota_tenantId_teamId_period_idx" ON "Quota"("tenantId", "teamId", "period");

-- CreateIndex
CREATE INDEX "Quota_tenantId_territoryId_period_idx" ON "Quota"("tenantId", "territoryId", "period");

-- CreateIndex
CREATE INDEX "DealContact_tenantId_idx" ON "DealContact"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DealContact_dealId_contactId_key" ON "DealContact"("dealId", "contactId");

-- CreateIndex
CREATE INDEX "DealStakeholder_tenantId_dealId_idx" ON "DealStakeholder"("tenantId", "dealId");

-- CreateIndex
CREATE UNIQUE INDEX "DealStakeholder_dealId_contactId_key" ON "DealStakeholder"("dealId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "DealStakeholder_id_tenantId_key" ON "DealStakeholder"("id", "tenantId");

-- CreateIndex
CREATE INDEX "DealProduct_tenantId_dealId_idx" ON "DealProduct"("tenantId", "dealId");

-- CreateIndex
CREATE UNIQUE INDEX "DealProduct_id_tenantId_key" ON "DealProduct"("id", "tenantId");

-- CreateIndex
CREATE INDEX "DealTeam_tenantId_dealId_idx" ON "DealTeam"("tenantId", "dealId");

-- CreateIndex
CREATE UNIQUE INDEX "DealTeam_tenantId_dealId_userId_splitType_key" ON "DealTeam"("tenantId", "dealId", "userId", "splitType");

-- CreateIndex
CREATE UNIQUE INDEX "DealTeam_id_tenantId_key" ON "DealTeam"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DealRoom_dealId_key" ON "DealRoom"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "DealRoom_slug_key" ON "DealRoom"("slug");

-- CreateIndex
CREATE INDEX "DealRoom_tenantId_idx" ON "DealRoom"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DealRoom_id_tenantId_key" ON "DealRoom"("id", "tenantId");

-- CreateIndex
CREATE INDEX "MutualActionItem_tenantId_idx" ON "MutualActionItem"("tenantId");

-- CreateIndex
CREATE INDEX "MutualActionItem_dealRoomId_idx" ON "MutualActionItem"("dealRoomId");

-- CreateIndex
CREATE INDEX "DealRoomDocument_tenantId_idx" ON "DealRoomDocument"("tenantId");

-- CreateIndex
CREATE INDEX "DealRoomDocument_dealRoomId_idx" ON "DealRoomDocument"("dealRoomId");

-- CreateIndex
CREATE INDEX "Pipeline_tenantId_idx" ON "Pipeline"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Pipeline_tenantId_name_key" ON "Pipeline"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Pipeline_id_tenantId_key" ON "Pipeline"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Stage_tenantId_pipelineId_idx" ON "Stage"("tenantId", "pipelineId");

-- CreateIndex
CREATE UNIQUE INDEX "Stage_pipelineId_name_key" ON "Stage"("pipelineId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Stage_id_tenantId_key" ON "Stage"("id", "tenantId");

-- CreateIndex
CREATE INDEX "FieldChangeLog_tenantId_objectType_objectId_idx" ON "FieldChangeLog"("tenantId", "objectType", "objectId");

-- CreateIndex
CREATE INDEX "FieldChangeLog_tenantId_changedAt_idx" ON "FieldChangeLog"("tenantId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FieldChangeLog_id_tenantId_key" ON "FieldChangeLog"("id", "tenantId");

-- CreateIndex
CREATE INDEX "WinLossReason_tenantId_type_idx" ON "WinLossReason"("tenantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "WinLossReason_id_tenantId_key" ON "WinLossReason"("id", "tenantId");

-- CreateIndex
CREATE INDEX "FieldPermission_tenantId_module_idx" ON "FieldPermission"("tenantId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "FieldPermission_tenantId_module_field_roleName_key" ON "FieldPermission"("tenantId", "module", "field", "roleName");

-- CreateIndex
CREATE UNIQUE INDEX "FieldPermission_id_tenantId_key" ON "FieldPermission"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ValidationRule_tenantId_objectType_idx" ON "ValidationRule"("tenantId", "objectType");

-- CreateIndex
CREATE UNIQUE INDEX "ValidationRule_id_tenantId_key" ON "ValidationRule"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PendingChange_tenantId_module_status_idx" ON "PendingChange"("tenantId", "module", "status");

-- CreateIndex
CREATE INDEX "PendingChange_tenantId_recordId_idx" ON "PendingChange"("tenantId", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "PendingChange_id_tenantId_key" ON "PendingChange"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ReviewProcessConfig_tenantId_module_idx" ON "ReviewProcessConfig"("tenantId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewProcessConfig_tenantId_module_key" ON "ReviewProcessConfig"("tenantId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewProcessConfig_id_tenantId_key" ON "ReviewProcessConfig"("id", "tenantId");

-- CreateIndex
CREATE INDEX "OrgWideDefault_tenantId_module_idx" ON "OrgWideDefault"("tenantId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "OrgWideDefault_tenantId_module_key" ON "OrgWideDefault"("tenantId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "OrgWideDefault_id_tenantId_key" ON "OrgWideDefault"("id", "tenantId");

-- CreateIndex
CREATE INDEX "SharingRule_tenantId_module_isActive_idx" ON "SharingRule"("tenantId", "module", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SharingRule_id_tenantId_key" ON "SharingRule"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ManualShare_tenantId_module_recordId_idx" ON "ManualShare"("tenantId", "module", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "ManualShare_id_tenantId_key" ON "ManualShare"("id", "tenantId");

-- CreateIndex
CREATE INDEX "RecordLock_tenantId_module_recordId_unlockedAt_idx" ON "RecordLock"("tenantId", "module", "recordId", "unlockedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecordLock_id_tenantId_key" ON "RecordLock"("id", "tenantId");

-- CreateIndex
CREATE INDEX "AssignmentRule_tenantId_module_isActive_idx" ON "AssignmentRule"("tenantId", "module", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentRule_id_tenantId_key" ON "AssignmentRule"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Activity_tenantId_idx" ON "Activity"("tenantId");

-- CreateIndex
CREATE INDEX "Activity_tenantId_ownerId_idx" ON "Activity"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "Activity_tenantId_dealId_idx" ON "Activity"("tenantId", "dealId");

-- CreateIndex
CREATE INDEX "Activity_tenantId_contactId_idx" ON "Activity"("tenantId", "contactId");

-- CreateIndex
CREATE INDEX "Activity_tenantId_accountId_idx" ON "Activity"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "Activity_tenantId_entityType_entityId_idx" ON "Activity"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "Activity_tenantId_type_idx" ON "Activity"("tenantId", "type");

-- CreateIndex
CREATE INDEX "Activity_tenantId_status_idx" ON "Activity"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Activity_tenantId_dueDate_idx" ON "Activity"("tenantId", "dueDate");

-- CreateIndex
CREATE INDEX "Activity_tenantId_ownerId_dueDate_status_idx" ON "Activity"("tenantId", "ownerId", "dueDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_id_tenantId_key" ON "Activity"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Note_tenantId_idx" ON "Note"("tenantId");

-- CreateIndex
CREATE INDEX "Note_tenantId_dealId_idx" ON "Note"("tenantId", "dealId");

-- CreateIndex
CREATE INDEX "Note_tenantId_contactId_idx" ON "Note"("tenantId", "contactId");

-- CreateIndex
CREATE INDEX "Note_tenantId_accountId_idx" ON "Note"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "Note_tenantId_leadId_idx" ON "Note"("tenantId", "leadId");

-- CreateIndex
CREATE INDEX "Note_tenantId_entityType_entityId_idx" ON "Note"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "Note_tenantId_authorId_idx" ON "Note"("tenantId", "authorId");

-- CreateIndex
CREATE INDEX "Note_tenantId_createdAt_idx" ON "Note"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Note_id_tenantId_key" ON "Note"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Quote_tenantId_dealId_idx" ON "Quote"("tenantId", "dealId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_tenantId_quoteNumber_key" ON "Quote"("tenantId", "quoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_id_tenantId_key" ON "Quote"("id", "tenantId");

-- CreateIndex
CREATE INDEX "QuoteProjection_tenantId_accountId_idx" ON "QuoteProjection"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "QuoteProjection_tenantId_contactId_idx" ON "QuoteProjection"("tenantId", "contactId");

-- CreateIndex
CREATE INDEX "QuoteProjection_tenantId_dealId_idx" ON "QuoteProjection"("tenantId", "dealId");

-- CreateIndex
CREATE INDEX "QuoteProjection_tenantId_status_idx" ON "QuoteProjection"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteProjection_tenantId_quoteId_key" ON "QuoteProjection"("tenantId", "quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteProjection_tenantId_sourceEventId_key" ON "QuoteProjection"("tenantId", "sourceEventId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteProjection_id_tenantId_key" ON "QuoteProjection"("id", "tenantId");

-- CreateIndex
CREATE INDEX "QuoteProjectionEvent_tenantId_quoteId_idx" ON "QuoteProjectionEvent"("tenantId", "quoteId");

-- CreateIndex
CREATE INDEX "QuoteProjectionEvent_tenantId_financeEventType_idx" ON "QuoteProjectionEvent"("tenantId", "financeEventType");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteProjectionEvent_tenantId_sourceEventId_key" ON "QuoteProjectionEvent"("tenantId", "sourceEventId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteProjectionEvent_id_tenantId_key" ON "QuoteProjectionEvent"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Attachment_tenantId_module_recordId_idx" ON "Attachment"("tenantId", "module", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_id_tenantId_key" ON "Attachment"("id", "tenantId");

-- CreateIndex
CREATE INDEX "EmailThread_tenantId_contactId_idx" ON "EmailThread"("tenantId", "contactId");

-- CreateIndex
CREATE INDEX "EmailThread_tenantId_accountId_idx" ON "EmailThread"("tenantId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailThread_tenantId_provider_externalId_key" ON "EmailThread"("tenantId", "provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailThread_id_tenantId_key" ON "EmailThread"("id", "tenantId");

-- CreateIndex
CREATE INDEX "EmailMessage_threadId_idx" ON "EmailMessage"("threadId");

-- CreateIndex
CREATE INDEX "CustomFieldDefinition_tenantId_entityType_idx" ON "CustomFieldDefinition"("tenantId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDefinition_tenantId_entityType_apiKey_key" ON "CustomFieldDefinition"("tenantId", "entityType", "apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDefinition_id_tenantId_key" ON "CustomFieldDefinition"("id", "tenantId");

-- CreateIndex
CREATE INDEX "DuplicateGroup_tenantId_entityType_status_idx" ON "DuplicateGroup"("tenantId", "entityType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateGroup_id_tenantId_key" ON "DuplicateGroup"("id", "tenantId");

-- CreateIndex
CREATE INDEX "DuplicateRecord_groupId_idx" ON "DuplicateRecord"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateRecord_groupId_recordId_key" ON "DuplicateRecord"("groupId", "recordId");

-- CreateIndex
CREATE INDEX "DuplicateRule_tenantId_module_isActive_idx" ON "DuplicateRule"("tenantId", "module", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateRule_id_tenantId_key" ON "DuplicateRule"("id", "tenantId");

-- CreateIndex
CREATE INDEX "DuplicateCandidate_tenantId_module_status_idx" ON "DuplicateCandidate"("tenantId", "module", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LeadScore_leadId_key" ON "LeadScore"("leadId");

-- CreateIndex
CREATE INDEX "LeadScore_tenantId_idx" ON "LeadScore"("tenantId");

-- CreateIndex
CREATE INDEX "LeadScore_tenantId_tier_idx" ON "LeadScore"("tenantId", "tier");

-- CreateIndex
CREATE UNIQUE INDEX "LeadScore_id_tenantId_key" ON "LeadScore"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountHealthScore_accountId_key" ON "AccountHealthScore"("accountId");

-- CreateIndex
CREATE INDEX "AccountHealthScore_tenantId_idx" ON "AccountHealthScore"("tenantId");

-- CreateIndex
CREATE INDEX "AccountHealthScore_tenantId_riskLevel_idx" ON "AccountHealthScore"("tenantId", "riskLevel");

-- CreateIndex
CREATE UNIQUE INDEX "AccountHealthScore_id_tenantId_key" ON "AccountHealthScore"("id", "tenantId");

-- CreateIndex
CREATE INDEX "LeadScoringRule_tenantId_idx" ON "LeadScoringRule"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadScoringRule_tenantId_signal_name_key" ON "LeadScoringRule"("tenantId", "signal", "name");

-- CreateIndex
CREATE UNIQUE INDEX "LeadScoringRule_id_tenantId_key" ON "LeadScoringRule"("id", "tenantId");

-- CreateIndex
CREATE INDEX "AiModel_tenantId_idx" ON "AiModel"("tenantId");

-- CreateIndex
CREATE INDEX "AiModel_tenantId_kind_isActive_idx" ON "AiModel"("tenantId", "kind", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AiModel_tenantId_kind_version_key" ON "AiModel"("tenantId", "kind", "version");

-- CreateIndex
CREATE INDEX "EnrichmentJob_tenantId_entityType_entityId_idx" ON "EnrichmentJob"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "EnrichmentJob_tenantId_status_idx" ON "EnrichmentJob"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EnrichmentJob_id_tenantId_key" ON "EnrichmentJob"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Competitor_tenantId_idx" ON "Competitor"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Competitor_tenantId_name_key" ON "Competitor"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Competitor_id_tenantId_key" ON "Competitor"("id", "tenantId");

-- CreateIndex
CREATE INDEX "DealCompetitor_tenantId_idx" ON "DealCompetitor"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DealCompetitor_dealId_competitorId_key" ON "DealCompetitor"("dealId", "competitorId");

-- CreateIndex
CREATE UNIQUE INDEX "DealCompetitor_id_tenantId_key" ON "DealCompetitor"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Territory_tenantId_idx" ON "Territory"("tenantId");

-- CreateIndex
CREATE INDEX "Territory_tenantId_isActive_idx" ON "Territory"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Territory_id_tenantId_key" ON "Territory"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesRep_userId_key" ON "SalesRep"("userId");

-- CreateIndex
CREATE INDEX "SalesRep_tenantId_idx" ON "SalesRep"("tenantId");

-- CreateIndex
CREATE INDEX "SalesRep_tenantId_isActive_idx" ON "SalesRep"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "SalesRep_territoryId_idx" ON "SalesRep"("territoryId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesRep_id_tenantId_key" ON "SalesRep"("id", "tenantId");

-- CreateIndex
CREATE INDEX "LeadRoutingEvent_tenantId_idx" ON "LeadRoutingEvent"("tenantId");

-- CreateIndex
CREATE INDEX "LeadRoutingEvent_leadId_idx" ON "LeadRoutingEvent"("leadId");

-- CreateIndex
CREATE INDEX "LeadRoutingEvent_territoryId_idx" ON "LeadRoutingEvent"("territoryId");

-- CreateIndex
CREATE INDEX "LeadRoutingEvent_salesRepId_idx" ON "LeadRoutingEvent"("salesRepId");

-- CreateIndex
CREATE INDEX "LeadRoutingEvent_priority_idx" ON "LeadRoutingEvent"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "LeadRoutingEvent_id_tenantId_key" ON "LeadRoutingEvent"("id", "tenantId");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_createdAt_idx" ON "OutboxMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_aggregateId_idx" ON "OutboxMessage"("aggregateId");

-- CreateIndex
CREATE INDEX "OutboxMessage_tenantId_idx" ON "OutboxMessage"("tenantId");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE INDEX "RecordFollower_tenantId_entityType_entityId_idx" ON "RecordFollower"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "RecordFollower_tenantId_userId_idx" ON "RecordFollower"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordFollower_tenantId_userId_entityType_entityId_key" ON "RecordFollower"("tenantId", "userId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "SavedView_tenantId_ownerId_entityType_idx" ON "SavedView"("tenantId", "ownerId", "entityType");

-- CreateIndex
CREATE INDEX "SavedView_tenantId_entityType_isShared_idx" ON "SavedView"("tenantId", "entityType", "isShared");

-- CreateIndex
CREATE INDEX "IdempotencyKey_tenantId_createdAt_idx" ON "IdempotencyKey"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_tenantId_key_key" ON "IdempotencyKey"("tenantId", "key");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactEmail" ADD CONSTRAINT "ContactEmail_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactAddress" ADD CONSTRAINT "ContactAddress_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountContactRelation" ADD CONSTRAINT "AccountContactRelation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountContactRelation" ADD CONSTRAINT "AccountContactRelation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_parentAccountId_fkey" FOREIGN KEY ("parentAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealContact" ADD CONSTRAINT "DealContact_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealContact" ADD CONSTRAINT "DealContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStakeholder" ADD CONSTRAINT "DealStakeholder_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStakeholder" ADD CONSTRAINT "DealStakeholder_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStakeholder" ADD CONSTRAINT "DealStakeholder_reportsToId_fkey" FOREIGN KEY ("reportsToId") REFERENCES "DealStakeholder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealProduct" ADD CONSTRAINT "DealProduct_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealTeam" ADD CONSTRAINT "DealTeam_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealRoom" ADD CONSTRAINT "DealRoom_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MutualActionItem" ADD CONSTRAINT "MutualActionItem_dealRoomId_fkey" FOREIGN KEY ("dealRoomId") REFERENCES "DealRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealRoomDocument" ADD CONSTRAINT "DealRoomDocument_dealRoomId_fkey" FOREIGN KEY ("dealRoomId") REFERENCES "DealRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinLossReason" ADD CONSTRAINT "WinLossReason_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EmailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateRecord" ADD CONSTRAINT "DuplicateRecord_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "DuplicateGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadScore" ADD CONSTRAINT "LeadScore_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountHealthScore" ADD CONSTRAINT "AccountHealthScore_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealCompetitor" ADD CONSTRAINT "DealCompetitor_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealCompetitor" ADD CONSTRAINT "DealCompetitor_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRep" ADD CONSTRAINT "SalesRep_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRep" ADD CONSTRAINT "SalesRep_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadRoutingEvent" ADD CONSTRAINT "LeadRoutingEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadRoutingEvent" ADD CONSTRAINT "LeadRoutingEvent_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadRoutingEvent" ADD CONSTRAINT "LeadRoutingEvent_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "SalesRep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

