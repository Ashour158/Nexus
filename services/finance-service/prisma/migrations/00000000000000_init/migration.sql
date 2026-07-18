-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('PHYSICAL', 'SERVICE', 'DIGITAL', 'BUNDLE', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "BillingType" AS ENUM ('ONE_TIME', 'RECURRING', 'USAGE', 'MILESTONE');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'VOID', 'CONVERTED', 'SUPERSEDED', 'SIGNED');

-- CreateEnum
CREATE TYPE "DiscountRequestStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DiscountReasonCode" AS ENUM ('COMPETITIVE_MATCH', 'STRATEGIC_ACCOUNT', 'VOLUME_COMMITMENT', 'MULTI_YEAR_COMMITMENT', 'NEW_LOGO_ACQUISITION', 'RENEWAL_SAVE', 'EXECUTIVE_EXCEPTION', 'MARKET_ENTRY', 'BUNDLE_NEGOTIATION', 'PAYMENT_TERMS_TRADEOFF');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'CONFIRMED', 'FULFILLING', 'FULFILLED', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "OrderFulfillmentStatus" AS ENUM ('PENDING', 'PARTIAL', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'PENDING_SIGNATURE', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'RENEWED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIAL', 'PAID', 'OVERDUE', 'VOID', 'UNCOLLECTIBLE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CREDIT_CARD', 'ACH', 'CHECK', 'WIRE', 'CRYPTO', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('DEAL_CLOSED', 'RECURRING', 'SPIFF', 'BONUS', 'CLAWBACK', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'DISPUTED', 'CLAWED_BACK');

-- CreateEnum
CREATE TYPE "RFQStatus" AS ENUM ('DRAFT', 'SENT', 'RESPONDED', 'REVIEWING', 'CONVERTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuoteTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuoteDocumentFormat" AS ENUM ('HTML', 'PDF', 'DOCX');

-- CreateEnum
CREATE TYPE "QuoteDocumentStatus" AS ENUM ('QUEUED', 'RENDERED', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuoteESignStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'SIGNED', 'DECLINED', 'VOIDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ConfigRuleType" AS ENUM ('REQUIRES', 'EXCLUDES', 'AUTO_ADD', 'PRICE_ADJUST');

-- CreateEnum
CREATE TYPE "GuidedAnswerType" AS ENUM ('SINGLE', 'MULTI', 'BOOLEAN', 'NUMBER');

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "description" TEXT,
    "descriptionAr" TEXT,
    "unitAr" TEXT,
    "type" "ProductType" NOT NULL DEFAULT 'SERVICE',
    "category" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "listPrice" DECIMAL(18,2) NOT NULL,
    "cost" DECIMAL(18,2),
    "billingType" "BillingType" NOT NULL DEFAULT 'ONE_TIME',
    "billingPeriod" TEXT,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "taxCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "pricingRules" JSONB NOT NULL DEFAULT '[]',
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceTier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minQty" INTEGER NOT NULL DEFAULT 1,
    "maxQty" INTEGER,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "applicableProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'SMB',
    "annualRevenue" DECIMAL(18,2),
    "taxZoneId" TEXT,
    "country" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactId" TEXT,
    "ownerId" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "validUntil" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "approvalStatus" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "paymentTerms" TEXT,
    "terms" TEXT,
    "notes" TEXT,
    "appliedPromos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lineItems" JSONB NOT NULL DEFAULT '[]',
    "pricingBreakdown" JSONB NOT NULL DEFAULT '{}',
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "baseCurrency" TEXT,
    "baseTotal" DECIMAL(18,2),
    "exchangeRate" DECIMAL(18,6),
    "taxZoneId" TEXT,
    "taxBreakdown" JSONB NOT NULL DEFAULT '[]',
    "templateId" TEXT,
    "rfqId" TEXT,
    "acceptanceToken" TEXT,
    "marginTotal" DECIMAL(18,2),
    "priceBookId" TEXT,
    "vendorTaxReg" TEXT,
    "buyerTaxReg" TEXT,
    "dueDate" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "requiredApprovalLevel" INTEGER NOT NULL DEFAULT 0,
    "approvalLevel" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteNumberConfig" (
    "tenantId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'QUO',
    "separator" TEXT NOT NULL DEFAULT '-',
    "includeYear" BOOLEAN NOT NULL DEFAULT true,
    "padding" INTEGER NOT NULL DEFAULT 5,
    "resetYearly" BOOLEAN NOT NULL DEFAULT true,
    "nextSequence" INTEGER NOT NULL DEFAULT 1,
    "lastYear" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteNumberConfig_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "tenantId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "nextSequence" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("tenantId","entity","period")
);

-- CreateTable
CREATE TABLE "QuoteApprovalTier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "minAmount" DECIMAL(18,2),
    "minDiscountPercent" DECIMAL(9,4),
    "approverRole" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteApprovalTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalMatrixRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "object" TEXT NOT NULL DEFAULT 'quote',
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "condition" JSONB NOT NULL DEFAULT '{}',
    "approverChain" JSONB NOT NULL DEFAULT '[]',
    "approverRole" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalMatrixRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT,
    "description" TEXT,
    "quantity" DECIMAL(18,6) NOT NULL,
    "listPrice" DECIMAL(18,2),
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "discountPercent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxPercent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'CPQ',
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteRevision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "approvalRequestId" TEXT,
    "status" "DiscountRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reasonCode" "DiscountReasonCode" NOT NULL,
    "reasonLabel" TEXT NOT NULL,
    "reasonNotes" TEXT,
    "currentDiscountPercent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "requestedDiscountPercent" DECIMAL(9,4) NOT NULL,
    "requestedDiscountAmount" DECIMAL(18,2) NOT NULL,
    "winningProbabilityIfApproved" INTEGER NOT NULL,
    "businessImpact" TEXT,
    "competitorName" TEXT,
    "expiresAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscountRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactId" TEXT,
    "dealId" TEXT,
    "quoteId" TEXT,
    "ownerId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "orderedAt" TIMESTAMP(3),
    "expectedFulfillmentAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "lineItems" JSONB NOT NULL DEFAULT '[]',
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderFulfillment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderFulfillmentStatus" NOT NULL DEFAULT 'PENDING',
    "deliveredQtyByLine" JSONB NOT NULL DEFAULT '{}',
    "reference" TEXT,
    "carrier" TEXT,
    "trackingNumber" TEXT,
    "notes" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderFulfillment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "renewalTermDays" INTEGER NOT NULL DEFAULT 30,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "totalValue" DECIMAL(18,2) NOT NULL,
    "signedAt" TIMESTAMP(3),
    "signedById" TEXT,
    "signatureData" JSONB,
    "terms" TEXT,
    "lineItems" JSONB NOT NULL DEFAULT '[]',
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contractId" TEXT,
    "productId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "billingPeriod" TEXT NOT NULL DEFAULT 'MONTHLY',
    "billingDay" INTEGER NOT NULL DEFAULT 1,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "trialEndDate" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "mrr" DECIMAL(18,2) NOT NULL,
    "arr" DECIMAL(18,2) NOT NULL,
    "nextBillingDate" TIMESTAMP(3),
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "contractId" TEXT,
    "orderId" TEXT,
    "quoteId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paidAmount" DECIMAL(18,2),
    "lineItems" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZatcaSubmission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "clearanceStatus" TEXT,
    "zatcaUuid" TEXT,
    "qrCode" TEXT,
    "invoiceHash" TEXT,
    "warnings" JSONB,
    "errors" JSONB,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZatcaSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "gateway" TEXT,
    "gatewayRef" TEXT,
    "notes" TEXT,
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "period" TEXT NOT NULL DEFAULT 'QUARTERLY',
    "rules" JSONB NOT NULL DEFAULT '[]',
    "accelerators" JSONB NOT NULL DEFAULT '[]',
    "decelerators" JSONB NOT NULL DEFAULT '[]',
    "spiffs" JSONB NOT NULL DEFAULT '[]',
    "clawbackDays" INTEGER NOT NULL DEFAULT 90,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "quota" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "dealId" TEXT,
    "invoiceId" TEXT,
    "type" "CommissionType" NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "baseAmount" DECIMAL(18,2) NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "finalAmount" DECIMAL(18,2) NOT NULL,
    "period" TEXT NOT NULL,
    "notes" TEXT,
    "breakdown" JSONB NOT NULL DEFAULT '[]',
    "clawbackOf" TEXT,
    "clawbackReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitPrice" DECIMAL(18,6),
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "billedAt" TIMESTAMP(3),

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Currency" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "decimalPlaces" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxZone" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "taxType" TEXT NOT NULL DEFAULT 'VAT',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "address" JSONB NOT NULL DEFAULT '{}',
    "taxRegistration" TEXT,
    "paymentTerms" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorProduct" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "vendorSku" TEXT,
    "costPrice" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "leadTimeDays" INTEGER NOT NULL DEFAULT 0,
    "minOrderQty" INTEGER NOT NULL DEFAULT 1,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductKit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "description" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "listPrice" DECIMAL(18,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "allowItemOverride" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductKitItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kitId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(18,2),
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductKitItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceBook" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "tiers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceBookEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "priceBookId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "minQty" INTEGER NOT NULL DEFAULT 1,
    "discountPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceBookEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RFQ" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rfqNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dealId" TEXT,
    "accountId" TEXT,
    "contactId" TEXT,
    "ownerId" TEXT NOT NULL,
    "status" "RFQStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "requiredByDate" TIMESTAMP(3),
    "lineItems" JSONB NOT NULL DEFAULT '[]',
    "vendorResponses" JSONB NOT NULL DEFAULT '[]',
    "internalNotes" TEXT,
    "convertedQuoteId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RFQ_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "storageKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "QuoteTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "contentType" TEXT NOT NULL DEFAULT 'text/html',
    "body" TEXT,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "templateId" TEXT,
    "format" "QuoteDocumentFormat" NOT NULL,
    "status" "QuoteDocumentStatus" NOT NULL DEFAULT 'QUEUED',
    "storageKey" TEXT,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "renderedHtml" TEXT,
    "contentBase64" TEXT,
    "contentSize" INTEGER,
    "checksum" TEXT,
    "renderData" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "generatedById" TEXT,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteESignEnvelope" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "documentId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'INTERNAL',
    "providerEnvelopeId" TEXT,
    "status" "QuoteESignStatus" NOT NULL DEFAULT 'DRAFT',
    "recipientName" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "sentById" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declinedReason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "auditTrail" JSONB NOT NULL DEFAULT '[]',
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteESignEnvelope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteAutomationRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "trigger" TEXT NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "templateId" TEXT,
    "priceBookId" TEXT,
    "actions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteAutomationRule_pkey" PRIMARY KEY ("id")
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
    "deletedAt" TIMESTAMP(3),

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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealRoomDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxMessage" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "key" TEXT,
    "payload" JSONB NOT NULL,
    "tenantId" TEXT,
    "aggregateType" TEXT,
    "aggregateId" TEXT,
    "eventType" TEXT,
    "correlationId" TEXT,
    "headers" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CpqTransitionLedger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "correlationId" TEXT,
    "actorId" TEXT,
    "source" TEXT,
    "sourceEventId" TEXT,
    "approvalRequestId" TEXT,
    "previousStatus" TEXT,
    "nextStatus" TEXT,
    "result" JSONB,
    "error" JSONB,
    "status" TEXT NOT NULL DEFAULT 'STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CpqTransitionLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigurableProduct" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigurableProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "configurableProductId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOption" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "optionGroupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "priceDelta" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "configurableProductId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ConfigRuleType" NOT NULL,
    "whenOptionId" TEXT NOT NULL,
    "thenOptionId" TEXT,
    "adjustment" DECIMAL(18,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuidedSellingFlow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL DEFAULT 'quote',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuidedSellingFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuidedSellingQuestion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "answerType" "GuidedAnswerType" NOT NULL DEFAULT 'SINGLE',
    "options" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuidedSellingQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuidedSellingRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "recommendedProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recommendedOptionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "weight" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuidedSellingRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_tenantId_idx" ON "Product"("tenantId");

-- CreateIndex
CREATE INDEX "Product_tenantId_isActive_idx" ON "Product"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_sku_key" ON "Product"("tenantId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_id_tenantId_key" ON "Product"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PriceTier_tenantId_productId_idx" ON "PriceTier"("tenantId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceTier_id_tenantId_key" ON "PriceTier"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PromoCode_tenantId_idx" ON "PromoCode"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_tenantId_code_key" ON "PromoCode"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_id_tenantId_key" ON "PromoCode"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Account_tenantId_idx" ON "Account"("tenantId");

-- CreateIndex
CREATE INDEX "Account_tenantId_country_idx" ON "Account"("tenantId", "country");

-- CreateIndex
CREATE UNIQUE INDEX "Account_id_tenantId_key" ON "Account"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_acceptanceToken_key" ON "Quote"("acceptanceToken");

-- CreateIndex
CREATE INDEX "Quote_tenantId_dealId_idx" ON "Quote"("tenantId", "dealId");

-- CreateIndex
CREATE INDEX "Quote_tenantId_accountId_idx" ON "Quote"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "Quote_tenantId_contactId_idx" ON "Quote"("tenantId", "contactId");

-- CreateIndex
CREATE INDEX "Quote_tenantId_status_idx" ON "Quote"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Quote_tenantId_dueDate_idx" ON "Quote"("tenantId", "dueDate");

-- CreateIndex
CREATE INDEX "Quote_tenantId_archivedAt_idx" ON "Quote"("tenantId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_tenantId_quoteNumber_key" ON "Quote"("tenantId", "quoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_id_tenantId_key" ON "Quote"("id", "tenantId");

-- CreateIndex
CREATE INDEX "QuoteApprovalTier_tenantId_isActive_idx" ON "QuoteApprovalTier"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteApprovalTier_id_tenantId_key" ON "QuoteApprovalTier"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ApprovalMatrixRule_tenantId_object_isActive_idx" ON "ApprovalMatrixRule"("tenantId", "object", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalMatrixRule_id_tenantId_key" ON "ApprovalMatrixRule"("id", "tenantId");

-- CreateIndex
CREATE INDEX "QuoteLine_tenantId_quoteId_idx" ON "QuoteLine"("tenantId", "quoteId");

-- CreateIndex
CREATE INDEX "QuoteLine_tenantId_productId_idx" ON "QuoteLine"("tenantId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteLine_id_tenantId_key" ON "QuoteLine"("id", "tenantId");

-- CreateIndex
CREATE INDEX "QuoteRevision_tenantId_quoteId_idx" ON "QuoteRevision"("tenantId", "quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRevision_tenantId_quoteId_version_key" ON "QuoteRevision"("tenantId", "quoteId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRevision_id_tenantId_key" ON "QuoteRevision"("id", "tenantId");

-- CreateIndex
CREATE INDEX "DiscountRequest_tenantId_quoteId_idx" ON "DiscountRequest"("tenantId", "quoteId");

-- CreateIndex
CREATE INDEX "DiscountRequest_tenantId_status_idx" ON "DiscountRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "DiscountRequest_tenantId_requestedById_idx" ON "DiscountRequest"("tenantId", "requestedById");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountRequest_id_tenantId_key" ON "DiscountRequest"("id", "tenantId");

-- CreateIndex
CREATE INDEX "SalesOrder_tenantId_accountId_idx" ON "SalesOrder"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "SalesOrder_tenantId_contactId_idx" ON "SalesOrder"("tenantId", "contactId");

-- CreateIndex
CREATE INDEX "SalesOrder_tenantId_quoteId_idx" ON "SalesOrder"("tenantId", "quoteId");

-- CreateIndex
CREATE INDEX "SalesOrder_tenantId_status_idx" ON "SalesOrder"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_tenantId_orderNumber_key" ON "SalesOrder"("tenantId", "orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_id_tenantId_key" ON "SalesOrder"("id", "tenantId");

-- CreateIndex
CREATE INDEX "OrderFulfillment_tenantId_orderId_idx" ON "OrderFulfillment"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "OrderFulfillment_tenantId_status_idx" ON "OrderFulfillment"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrderFulfillment_id_tenantId_key" ON "OrderFulfillment"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Contract_tenantId_accountId_idx" ON "Contract"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "Contract_tenantId_status_idx" ON "Contract"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_tenantId_contractNumber_key" ON "Contract"("tenantId", "contractNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_id_tenantId_key" ON "Contract"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Subscription_tenantId_accountId_idx" ON "Subscription"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "Subscription_tenantId_status_idx" ON "Subscription"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_tenantId_accountId_productId_key" ON "Subscription"("tenantId", "accountId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_id_tenantId_key" ON "Subscription"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_accountId_idx" ON "Invoice"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_status_idx" ON "Invoice"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_orderId_idx" ON "Invoice"("tenantId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_invoiceNumber_key" ON "Invoice"("tenantId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_id_tenantId_key" ON "Invoice"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ZatcaSubmission_invoiceId_key" ON "ZatcaSubmission"("invoiceId");

-- CreateIndex
CREATE INDEX "ZatcaSubmission_tenantId_idx" ON "ZatcaSubmission"("tenantId");

-- CreateIndex
CREATE INDEX "ZatcaSubmission_status_tenantId_idx" ON "ZatcaSubmission"("status", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ZatcaSubmission_id_tenantId_key" ON "ZatcaSubmission"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_invoiceId_idx" ON "Payment"("tenantId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_id_tenantId_key" ON "Payment"("id", "tenantId");

-- CreateIndex
CREATE INDEX "CommissionPlan_tenantId_idx" ON "CommissionPlan"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionPlan_tenantId_name_key" ON "CommissionPlan"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionPlan_id_tenantId_key" ON "CommissionPlan"("id", "tenantId");

-- CreateIndex
CREATE INDEX "CommissionAssignment_tenantId_userId_idx" ON "CommissionAssignment"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionAssignment_id_tenantId_key" ON "CommissionAssignment"("id", "tenantId");

-- CreateIndex
CREATE INDEX "CommissionRecord_tenantId_userId_idx" ON "CommissionRecord"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "CommissionRecord_tenantId_period_idx" ON "CommissionRecord"("tenantId", "period");

-- CreateIndex
CREATE INDEX "CommissionRecord_tenantId_status_idx" ON "CommissionRecord"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CommissionRecord_tenantId_planId_idx" ON "CommissionRecord"("tenantId", "planId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionRecord_id_tenantId_key" ON "CommissionRecord"("id", "tenantId");

-- CreateIndex
CREATE INDEX "UsageRecord_tenantId_subscriptionId_idx" ON "UsageRecord"("tenantId", "subscriptionId");

-- CreateIndex
CREATE INDEX "UsageRecord_tenantId_recordedAt_idx" ON "UsageRecord"("tenantId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UsageRecord_id_tenantId_key" ON "UsageRecord"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Currency_tenantId_idx" ON "Currency"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Currency_tenantId_code_key" ON "Currency"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Currency_id_tenantId_key" ON "Currency"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ExchangeRate_tenantId_fromCurrency_toCurrency_idx" ON "ExchangeRate"("tenantId", "fromCurrency", "toCurrency");

-- CreateIndex
CREATE INDEX "ExchangeRate_tenantId_effectiveFrom_idx" ON "ExchangeRate"("tenantId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_id_tenantId_key" ON "ExchangeRate"("id", "tenantId");

-- CreateIndex
CREATE INDEX "TaxZone_tenantId_idx" ON "TaxZone"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxZone_id_tenantId_key" ON "TaxZone"("id", "tenantId");

-- CreateIndex
CREATE INDEX "TaxRate_tenantId_zoneId_idx" ON "TaxRate"("tenantId", "zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRate_id_tenantId_key" ON "TaxRate"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Vendor_tenantId_idx" ON "Vendor"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_id_tenantId_key" ON "Vendor"("id", "tenantId");

-- CreateIndex
CREATE INDEX "VendorProduct_tenantId_vendorId_idx" ON "VendorProduct"("tenantId", "vendorId");

-- CreateIndex
CREATE INDEX "VendorProduct_tenantId_productId_idx" ON "VendorProduct"("tenantId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorProduct_id_tenantId_key" ON "VendorProduct"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ProductKit_tenantId_idx" ON "ProductKit"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductKit_id_tenantId_key" ON "ProductKit"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ProductKitItem_tenantId_kitId_idx" ON "ProductKitItem"("tenantId", "kitId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductKitItem_id_tenantId_key" ON "ProductKitItem"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PriceBook_tenantId_idx" ON "PriceBook"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceBook_id_tenantId_key" ON "PriceBook"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PriceBookEntry_tenantId_priceBookId_idx" ON "PriceBookEntry"("tenantId", "priceBookId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceBookEntry_priceBookId_productId_minQty_key" ON "PriceBookEntry"("priceBookId", "productId", "minQty");

-- CreateIndex
CREATE UNIQUE INDEX "PriceBookEntry_id_tenantId_key" ON "PriceBookEntry"("id", "tenantId");

-- CreateIndex
CREATE INDEX "RFQ_tenantId_status_idx" ON "RFQ"("tenantId", "status");

-- CreateIndex
CREATE INDEX "RFQ_tenantId_dealId_idx" ON "RFQ"("tenantId", "dealId");

-- CreateIndex
CREATE INDEX "RFQ_tenantId_accountId_idx" ON "RFQ"("tenantId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "RFQ_tenantId_rfqNumber_key" ON "RFQ"("tenantId", "rfqNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RFQ_id_tenantId_key" ON "RFQ"("id", "tenantId");

-- CreateIndex
CREATE INDEX "QuoteTemplate_tenantId_idx" ON "QuoteTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "QuoteTemplate_tenantId_isActive_language_idx" ON "QuoteTemplate"("tenantId", "isActive", "language");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteTemplate_tenantId_name_version_language_key" ON "QuoteTemplate"("tenantId", "name", "version", "language");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteTemplate_id_tenantId_key" ON "QuoteTemplate"("id", "tenantId");

-- CreateIndex
CREATE INDEX "QuoteDocument_tenantId_quoteId_idx" ON "QuoteDocument"("tenantId", "quoteId");

-- CreateIndex
CREATE INDEX "QuoteDocument_tenantId_status_idx" ON "QuoteDocument"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteDocument_id_tenantId_key" ON "QuoteDocument"("id", "tenantId");

-- CreateIndex
CREATE INDEX "QuoteESignEnvelope_tenantId_quoteId_idx" ON "QuoteESignEnvelope"("tenantId", "quoteId");

-- CreateIndex
CREATE INDEX "QuoteESignEnvelope_tenantId_status_idx" ON "QuoteESignEnvelope"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteESignEnvelope_id_tenantId_key" ON "QuoteESignEnvelope"("id", "tenantId");

-- CreateIndex
CREATE INDEX "QuoteAutomationRule_tenantId_trigger_idx" ON "QuoteAutomationRule"("tenantId", "trigger");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteAutomationRule_id_tenantId_key" ON "QuoteAutomationRule"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DealRoom_dealId_key" ON "DealRoom"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "DealRoom_slug_key" ON "DealRoom"("slug");

-- CreateIndex
CREATE INDEX "DealRoom_tenantId_idx" ON "DealRoom"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DealRoom_id_tenantId_key" ON "DealRoom"("id", "tenantId");

-- CreateIndex
CREATE INDEX "MutualActionItem_dealRoomId_idx" ON "MutualActionItem"("dealRoomId");

-- CreateIndex
CREATE UNIQUE INDEX "MutualActionItem_id_tenantId_key" ON "MutualActionItem"("id", "tenantId");

-- CreateIndex
CREATE INDEX "DealRoomDocument_dealRoomId_idx" ON "DealRoomDocument"("dealRoomId");

-- CreateIndex
CREATE UNIQUE INDEX "DealRoomDocument_id_tenantId_key" ON "DealRoomDocument"("id", "tenantId");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_createdAt_idx" ON "OutboxMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_processedAt_retryCount_createdAt_idx" ON "OutboxMessage"("processedAt", "retryCount", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_aggregateType_aggregateId_idx" ON "OutboxMessage"("aggregateType", "aggregateId");

-- CreateIndex
CREATE INDEX "OutboxMessage_aggregateId_idx" ON "OutboxMessage"("aggregateId");

-- CreateIndex
CREATE INDEX "cpq_transition_ledger_entity_idx" ON "CpqTransitionLedger"("tenantId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "cpq_transition_ledger_correlation_idx" ON "CpqTransitionLedger"("tenantId", "correlationId");

-- CreateIndex
CREATE INDEX "cpq_transition_ledger_source_event_idx" ON "CpqTransitionLedger"("tenantId", "sourceEventId");

-- CreateIndex
CREATE UNIQUE INDEX "cpq_transition_ledger_idempotency_key" ON "CpqTransitionLedger"("tenantId", "entity", "entityId", "action", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "cpq_transition_ledger_id_tenant_key" ON "CpqTransitionLedger"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ConfigurableProduct_tenantId_idx" ON "ConfigurableProduct"("tenantId");

-- CreateIndex
CREATE INDEX "ConfigurableProduct_tenantId_productId_idx" ON "ConfigurableProduct"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "ConfigurableProduct_tenantId_isActive_idx" ON "ConfigurableProduct"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigurableProduct_id_tenantId_key" ON "ConfigurableProduct"("id", "tenantId");

-- CreateIndex
CREATE INDEX "OptionGroup_tenantId_configurableProductId_idx" ON "OptionGroup"("tenantId", "configurableProductId");

-- CreateIndex
CREATE UNIQUE INDEX "OptionGroup_id_tenantId_key" ON "OptionGroup"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ProductOption_tenantId_optionGroupId_idx" ON "ProductOption"("tenantId", "optionGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOption_id_tenantId_key" ON "ProductOption"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ConfigRule_tenantId_configurableProductId_idx" ON "ConfigRule"("tenantId", "configurableProductId");

-- CreateIndex
CREATE INDEX "ConfigRule_tenantId_configurableProductId_isActive_idx" ON "ConfigRule"("tenantId", "configurableProductId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigRule_id_tenantId_key" ON "ConfigRule"("id", "tenantId");

-- CreateIndex
CREATE INDEX "GuidedSellingFlow_tenantId_idx" ON "GuidedSellingFlow"("tenantId");

-- CreateIndex
CREATE INDEX "GuidedSellingFlow_tenantId_isActive_idx" ON "GuidedSellingFlow"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "GuidedSellingFlow_id_tenantId_key" ON "GuidedSellingFlow"("id", "tenantId");

-- CreateIndex
CREATE INDEX "GuidedSellingQuestion_tenantId_flowId_idx" ON "GuidedSellingQuestion"("tenantId", "flowId");

-- CreateIndex
CREATE UNIQUE INDEX "GuidedSellingQuestion_id_tenantId_key" ON "GuidedSellingQuestion"("id", "tenantId");

-- CreateIndex
CREATE INDEX "GuidedSellingRule_tenantId_flowId_idx" ON "GuidedSellingRule"("tenantId", "flowId");

-- CreateIndex
CREATE INDEX "GuidedSellingRule_tenantId_flowId_isActive_idx" ON "GuidedSellingRule"("tenantId", "flowId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "GuidedSellingRule_id_tenantId_key" ON "GuidedSellingRule"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRevision" ADD CONSTRAINT "QuoteRevision_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRequest" ADD CONSTRAINT "DiscountRequest_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFulfillment" ADD CONSTRAINT "OrderFulfillment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionAssignment" ADD CONSTRAINT "CommissionAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CommissionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "TaxZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorProduct" ADD CONSTRAINT "VendorProduct_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductKitItem" ADD CONSTRAINT "ProductKitItem_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "ProductKit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBookEntry" ADD CONSTRAINT "PriceBookEntry_priceBookId_fkey" FOREIGN KEY ("priceBookId") REFERENCES "PriceBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteDocument" ADD CONSTRAINT "QuoteDocument_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteDocument" ADD CONSTRAINT "QuoteDocument_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "QuoteTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteESignEnvelope" ADD CONSTRAINT "QuoteESignEnvelope_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MutualActionItem" ADD CONSTRAINT "MutualActionItem_dealRoomId_fkey" FOREIGN KEY ("dealRoomId") REFERENCES "DealRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealRoomDocument" ADD CONSTRAINT "DealRoomDocument_dealRoomId_fkey" FOREIGN KEY ("dealRoomId") REFERENCES "DealRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionGroup" ADD CONSTRAINT "OptionGroup_configurableProductId_fkey" FOREIGN KEY ("configurableProductId") REFERENCES "ConfigurableProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_optionGroupId_fkey" FOREIGN KEY ("optionGroupId") REFERENCES "OptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigRule" ADD CONSTRAINT "ConfigRule_configurableProductId_fkey" FOREIGN KEY ("configurableProductId") REFERENCES "ConfigurableProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuidedSellingQuestion" ADD CONSTRAINT "GuidedSellingQuestion_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "GuidedSellingFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuidedSellingRule" ADD CONSTRAINT "GuidedSellingRule_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "GuidedSellingFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

