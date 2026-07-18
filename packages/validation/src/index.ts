import { z } from 'zod';

// ─── Common — Section 33 ──────────────────────────────────────────────────────

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export const IdParamSchema = z.object({ id: z.string().cuid() });

// ─── Auth / User — Section 33 ───────────────────────────────────────────────

export const InviteUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  roleIds: z.array(z.string().cuid()).min(1),
});

export const UpdateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(30).optional(),
  timezone: z.string().optional(),
  locale: z.string().optional(),
  avatarUrl: z.string().url().optional(),
});

export const CreateRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  permissions: z.array(z.string()),
});

export const UpdateRoleSchema = CreateRoleSchema.partial();

export const KeycloakLoginSchema = z.object({
  keycloakAccessToken: z.string().min(1),
});

export const RefreshTokenBodySchema = z.object({
  refreshToken: z.string().min(1),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(256),
});

export const AssignRolesSchema = z.object({
  roleIds: z.array(z.string().cuid()).min(1),
});

export const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const PatchTenantSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  settings: z.record(z.unknown()).optional(),
});

/** Query string for GET /users — Section 33-style list filters + pagination. */
export const UserListQuerySchema = PaginationSchema.extend({
  search: z.string().optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  roleId: z.string().cuid().optional(),
});

// ─── CRM / Deal — Section 33 ────────────────────────────────────────────────

export const CreateDealSchema = z.object({
  name: z.string().min(1).max(200),
  accountId: z.string().cuid(),
  pipelineId: z.string().cuid(),
  stageId: z.string().cuid(),
  ownerId: z.string().cuid(),
  amount: z.number().min(0).default(0),
  currency: z.string().length(3).default('USD'),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.string().datetime().optional(),
  // Optional manual override; otherwise auto-derived from the stage on create.
  forecastCategory: z
    .enum(['PIPELINE', 'BEST_CASE', 'COMMIT', 'CLOSED', 'OMITTED'])
    .optional(),
  source: z.string().optional(),
  campaignId: z.string().cuid().optional(),
  contactIds: z.array(z.string().cuid()).default([]),
  customFields: z.record(z.unknown()).default({}),
  tags: z.array(z.string()).default([]),
});

export const UpdateDealSchema = CreateDealSchema.partial().extend({
  status: z.enum(['OPEN', 'WON', 'LOST', 'DORMANT']).optional(),
  lostReason: z.string().optional(),
  closeReason: z.string().max(500).optional(),
  forecastCategory: z
    .enum(['PIPELINE', 'BEST_CASE', 'COMMIT', 'CLOSED', 'OMITTED'])
    .optional(),
  meddicicData: z.record(z.unknown()).optional(),
  // ─── Renewal / recurring-revenue fields (additive; all optional) ───────────
  contractEndDate: z.string().datetime().nullable().optional(),
  renewalProbability: z.number().int().min(0).max(100).nullable().optional(),
  isRenewal: z.boolean().optional(),
  renewedFromDealId: z.string().cuid().nullable().optional(),
  mrr: z.number().min(0).nullable().optional(),
  arr: z.number().min(0).nullable().optional(),
  // Optimistic-concurrency token (DI-26). When supplied, the update only applies
  // if the stored row is still at this version; otherwise it 409s. Optional so
  // existing callers keep last-write-wins.
  version: z.number().int().nonnegative().optional(),
});

/** Body for PATCH /deals/:id/stage (Section 34.2). */
export const MoveDealStageSchema = z.object({
  stageId: z.string().cuid(),
});

/** Body for POST /deals/:id/lost (Section 34.2). */
export const MarkDealLostSchema = z.object({
  reason: z.string().min(1).max(200),
  detail: z.string().max(2000).optional(),
});

/** Body for POST /deals/:id/contacts (Section 34.2). */
export const AddDealContactSchema = z.object({
  contactId: z.string().cuid(),
  role: z.string().max(100).optional(),
  isPrimary: z.boolean().optional(),
});

/** Query string for GET /deals — Section 34.2 list filters + pagination. */
export const DealListQuerySchema = PaginationSchema.extend({
  pipelineId: z.string().cuid().optional(),
  stageId: z.string().cuid().optional(),
  ownerId: z.string().cuid().optional(),
  accountId: z.string().cuid().optional(),
  status: z.enum(['OPEN', 'WON', 'LOST', 'DORMANT']).optional(),
  search: z.string().optional(),
  minAmount: z.coerce.number().min(0).optional(),
  maxAmount: z.coerce.number().min(0).optional(),
  // Renewal filters (additive). `isRenewal=true` narrows to renewal deals;
  // `contractEndBefore=<iso>` surfaces contracts expiring before a cutoff.
  isRenewal: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  contractEndBefore: z.string().datetime().optional(),
  includeDeleted: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

// ─── CRM / Account — Section 33 ─────────────────────────────────────────────

const AccountTypeEnum = z.enum([
  'PROSPECT',
  'CUSTOMER',
  'PARTNER',
  'COMPETITOR',
  'OTHER',
]);
const AccountTierEnum = z.enum([
  'SMB',
  'MID_MARKET',
  'ENTERPRISE',
  'STRATEGIC',
]);
const AccountStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'AT_RISK', 'CHURNED']);

export const CreateAccountSchema = z.object({
  name: z.string().min(1).max(200),
  ownerId: z.string().cuid(),
  parentAccountId: z.string().cuid().optional(),
  code: z.string().max(100).optional(),
  legalName: z.string().max(200).optional(),
  tradeName: z.string().max(200).optional(),
  website: z.string().url().optional(),
  phone: z.string().max(30).optional(),
  fax: z.string().max(30).optional(),
  email: z.string().email().optional(),
  industry: z.string().max(100).optional(),
  subIndustry: z.string().max(100).optional(),
  type: AccountTypeEnum.default('PROSPECT'),
  tier: AccountTierEnum.default('SMB'),
  status: AccountStatusEnum.default('ACTIVE'),
  lifecycleStage: z.string().max(50).optional(),
  annualRevenue: z.number().min(0).optional(),
  employeeCount: z.number().int().min(0).optional(),
  foundedYear: z.number().int().min(1000).max(2100).optional(),
  country: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  zipCode: z.string().max(20).optional(),
  linkedInUrl: z.string().url().optional(),
  description: z.string().max(2000).optional(),
  sicCode: z.string().max(20).optional(),
  naicsCode: z.string().max(20).optional(),
  taxId: z.string().max(50).optional(),
  vatNumber: z.string().max(50).optional(),
  commercialRegistrationNumber: z.string().max(50).optional(),
  paymentTerms: z.string().max(100).optional(),
  creditLimit: z.number().min(0).optional(),
  currency: z.string().length(3).default('USD'),
  priceBookId: z.string().cuid().optional(),
  territoryId: z.string().cuid().optional(),
  healthScore: z.number().int().min(0).max(100).optional(),
  npsScore: z.number().int().min(-100).max(100).optional(),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  lastActivityAt: z.string().datetime().optional(),
  billingAddressLine1: z.string().max(500).optional(),
  billingAddressLine2: z.string().max(500).optional(),
  billingCity: z.string().max(100).optional(),
  billingState: z.string().max(100).optional(),
  billingPostalCode: z.string().max(20).optional(),
  billingCountry: z.string().max(100).optional(),
  billingLatitude: z.number().min(-90).max(90).optional(),
  billingLongitude: z.number().min(-180).max(180).optional(),
  shippingAddressLine1: z.string().max(500).optional(),
  shippingAddressLine2: z.string().max(500).optional(),
  shippingCity: z.string().max(100).optional(),
  shippingState: z.string().max(100).optional(),
  shippingPostalCode: z.string().max(20).optional(),
  shippingCountry: z.string().max(100).optional(),
  shippingLatitude: z.number().min(-90).max(90).optional(),
  shippingLongitude: z.number().min(-180).max(180).optional(),
  shippingInstructions: z.string().max(1000).optional(),
  sameAsBilling: z.boolean().optional(),
  customFields: z.record(z.unknown()).default({}),
  tags: z.array(z.string()).default([]),
});

export const UpdateAccountSchema = CreateAccountSchema.partial();

export const AccountListQuerySchema = PaginationSchema.extend({
  ownerId: z.string().cuid().optional(),
  type: AccountTypeEnum.optional(),
  tier: AccountTierEnum.optional(),
  status: AccountStatusEnum.optional(),
  industry: z.string().optional(),
  search: z.string().optional(),
});

/** Shape of `Deal.meddicicData` — validated on PATCH /deals/:id/meddic (Section 32). */
export const MeddicicDataSchema = z.object({
  metrics: z.object({ score: z.number().min(0).max(100), notes: z.string() }),
  economicBuyer: z.object({
    identified: z.boolean(),
    name: z.string().optional(),
    notes: z.string(),
  }),
  decisionCriteria: z.object({ score: z.number().min(0).max(100), notes: z.string() }),
  decisionProcess: z.object({ score: z.number().min(0).max(100), notes: z.string() }),
  paperProcess: z.object({ score: z.number().min(0).max(100), notes: z.string() }),
  identifyPain: z.object({ score: z.number().min(0).max(100), notes: z.string() }),
  champion: z.object({
    identified: z.boolean(),
    name: z.string().optional(),
    notes: z.string(),
  }),
  competition: z.object({
    identified: z.boolean(),
    competitors: z.array(z.string()).default([]),
    notes: z.string(),
  }),
  totalScore: z.number().min(0).max(100),
});

// ─── CRM / Contact — Section 33 ─────────────────────────────────────────────

export const CreateContactSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  ownerId: z.string().cuid(),
  accountId: z.string().cuid(),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  mobile: z.string().max(30).optional(),
  jobTitle: z.string().max(200).optional(),
  department: z.string().max(200).optional(),
  linkedInUrl: z.string().url().optional(),
  twitterHandle: z.string().max(50).optional(),
  country: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  timezone: z.string().max(100).optional(),
  preferredChannel: z.string().max(50).optional(),
  doNotEmail: z.boolean().optional(),
  doNotCall: z.boolean().optional(),
  gdprConsent: z.boolean().optional(),
  code: z.string().max(100).optional(),
  customFields: z.record(z.unknown()).default({}),
  tags: z.array(z.string()).default([]),
});

export const UpdateContactSchema = CreateContactSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const ContactListQuerySchema = PaginationSchema.extend({
  accountId: z.string().cuid().optional(),
  ownerId: z.string().cuid().optional(),
  search: z.string().optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

// ─── CRM / Lead — Section 33 ────────────────────────────────────────────────

const LeadSourceEnum = z.enum([
  'MANUAL',
  'IMPORT',
  'WEB_FORM',
  'EMAIL_CAMPAIGN',
  'SOCIAL_MEDIA',
  'PAID_ADS',
  'REFERRAL',
  'PARTNER',
  'CHAT',
  'EVENT',
  'OTHER',
]);
const LeadStatusEnum = z.enum([
  'NEW',
  'ASSIGNED',
  'WORKING',
  'QUALIFIED',
  'UNQUALIFIED',
  'CONVERTED',
]);
const LeadRatingEnum = z.enum(['HOT', 'WARM', 'COLD']);

export const CreateLeadSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  ownerId: z.string().cuid(),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  company: z.string().max(200).optional(),
  jobTitle: z.string().max(200).optional(),
  source: LeadSourceEnum.default('MANUAL'),
  rating: LeadRatingEnum.default('COLD'),
  industry: z.string().max(100).optional(),
  website: z.string().url().optional(),
  annualRevenue: z.number().min(0).optional(),
  employeeCount: z.number().int().min(0).optional(),
  country: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  linkedInUrl: z.string().url().optional(),
  twitterHandle: z.string().max(50).optional(),
  utmSource: z.string().max(100).optional(),
  utmMedium: z.string().max(100).optional(),
  utmCampaign: z.string().max(100).optional(),
  utmContent: z.string().max(100).optional(),
  utmTerm: z.string().max(100).optional(),
  customFields: z.record(z.unknown()).default({}),
  tags: z.array(z.string()).default([]),
  doNotContact: z.boolean().optional(),
  gdprConsent: z.boolean().optional(),
});

export const UpdateLeadSchema = CreateLeadSchema.partial().extend({
  status: LeadStatusEnum.optional(),
  score: z.number().int().min(0).max(100).optional(),
});

export const LeadListQuerySchema = PaginationSchema.extend({
  ownerId: z.string().cuid().optional(),
  status: LeadStatusEnum.optional(),
  source: LeadSourceEnum.optional(),
  rating: LeadRatingEnum.optional(),
  search: z.string().optional(),
});

export const ConvertLeadSchema = z.object({
  accountName: z.string().min(1).max(200).optional(),
  accountId: z.string().cuid().optional(),
  createDeal: z.boolean().default(false),
  dealName: z.string().min(1).max(200).optional(),
  dealAmount: z.number().min(0).optional(),
  pipelineId: z.string().cuid().optional(),
  stageId: z.string().cuid().optional(),
});

// ─── CRM / Pipeline + Stage — Section 33 ────────────────────────────────────

const StageBodySchema = z.object({
  name: z.string().min(1).max(100),
  /** Stage order — prefer explicit `position` from Prompt 31 pipelines UI when present. */
  order: z.number().int().min(0).optional(),
  position: z.number().int().min(0).optional(),
  probability: z.number().int().min(0).max(100).default(0),
  rottenDays: z.number().int().min(1).default(30),
  requiredFields: z.array(z.string()).default([]),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default('#6B7280'),
  isWon: z.boolean().optional(),
  isLost: z.boolean().optional(),
});

/** Create — requires `order` or `position`. */
export const CreateStageSchema = StageBodySchema.superRefine((v, ctx) => {
  if (v.order === undefined && v.position === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'order or position is required' });
  }
});

/** Update — all fields optional; callers may send `position` as alias for `order`. */
export const UpdateStageSchema = StageBodySchema.partial();

export const CreatePipelineSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.string().max(40).optional(),
  currency: z.string().length(3).default('USD'),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  description: z.string().max(2000).optional(),
  ownedBy: z.string().max(120).optional(),
  stages: z.array(CreateStageSchema).min(1).default([]),
});

export const UpdatePipelineSchema = CreatePipelineSchema.partial().omit({
  stages: true,
});

// ─── Finance / Product — Section 33 ─────────────────────────────────────────

const ProductTypeEnum = z.enum([
  'PHYSICAL',
  'SERVICE',
  'DIGITAL',
  'BUNDLE',
  'SUBSCRIPTION',
]);
const BillingTypeEnum = z.enum(['ONE_TIME', 'RECURRING', 'USAGE', 'MILESTONE']);

export const CreateProductSchema = z.object({
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  nameAr: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  descriptionAr: z.string().max(2000).optional(),
  unitAr: z.string().max(50).optional(),
  type: ProductTypeEnum.default('SERVICE'),
  category: z.string().max(100).optional(),
  currency: z.string().length(3).default('USD'),
  listPrice: z.number().min(0),
  cost: z.number().min(0).optional(),
  billingType: BillingTypeEnum.default('ONE_TIME'),
  billingPeriod: z.string().max(50).optional(),
  taxable: z.boolean().default(true),
  taxCode: z.string().max(50).optional(),
  isActive: z.boolean().default(true),
  pricingRules: z.array(z.record(z.unknown())).default([]),
  priceTiers: z
    .array(
      z.object({
        name: z.string(),
        minQty: z.number().int().min(1),
        maxQty: z.number().int().min(1).optional(),
        unitPrice: z.number().min(0),
      })
    )
    .default([]),
  customFields: z.record(z.unknown()).default({}),
});

export const UpdateProductSchema = CreateProductSchema.partial();

export const ProductListQuerySchema = PaginationSchema.extend({
  type: ProductTypeEnum.optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  search: z.string().optional(),
});

// ─── Finance / Invoice + Payment — Section 33 ───────────────────────────────

const InvoiceStatusEnum = z.enum([
  'DRAFT',
  'SENT',
  'PARTIAL',
  'PAID',
  'OVERDUE',
  'VOID',
  'UNCOLLECTIBLE',
]);
const PaymentMethodEnum = z.enum([
  'BANK_TRANSFER',
  'CREDIT_CARD',
  'ACH',
  'CHECK',
  'WIRE',
  'CRYPTO',
  'OTHER',
]);

export const InvoiceLineItemSchema = z.object({
  productId: z.string().cuid().optional(),
  description: z.string().min(1),
  quantity: z.number().min(0),
  unitPrice: z.number().min(0),
  discountPercent: z.number().min(0).max(100).default(0),
  taxPercent: z.number().min(0).max(100).default(0),
});

export const CreateInvoiceSchema = z.object({
  accountId: z.string().cuid(),
  subscriptionId: z.string().cuid().optional(),
  contractId: z.string().cuid().optional(),
  currency: z.string().length(3).default('USD'),
  dueDate: z.string().datetime().optional(),
  lineItems: z.array(InvoiceLineItemSchema).min(1),
  notes: z.string().max(2000).optional(),
  customFields: z.record(z.unknown()).default({}),
});

export const UpdateInvoiceSchema = z.object({
  status: InvoiceStatusEnum.optional(),
  dueDate: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
  lineItems: z.array(InvoiceLineItemSchema).optional(),
  customFields: z.record(z.unknown()).optional(),
});

export const RecordPaymentSchema = z.object({
  amount: z.number().min(0.01),
  currency: z.string().length(3).default('USD'),
  method: PaymentMethodEnum,
  reference: z.string().max(200).optional(),
  gateway: z.string().max(100).optional(),
  gatewayRef: z.string().max(200).optional(),
  paidAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});

export const InvoiceListQuerySchema = PaginationSchema.extend({
  accountId: z.string().cuid().optional(),
  status: InvoiceStatusEnum.optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  search: z.string().optional(),
});

// ─── Finance / Contract — Section 33 ────────────────────────────────────────

const ContractStatusEnum = z.enum([
  'DRAFT',
  'PENDING_SIGNATURE',
  'ACTIVE',
  'EXPIRED',
  'TERMINATED',
  'RENEWED',
]);

export const CreateContractSchema = z.object({
  accountId: z.string().cuid(),
  ownerId: z.string().cuid(),
  name: z.string().min(1).max(200),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  autoRenew: z.boolean().default(false),
  renewalTermDays: z.number().int().min(1).default(30),
  currency: z.string().length(3).default('USD'),
  totalValue: z.number().min(0),
  terms: z.string().max(10000).optional(),
  lineItems: z.array(InvoiceLineItemSchema).default([]),
  customFields: z.record(z.unknown()).default({}),
});

export const UpdateContractSchema = CreateContractSchema.partial().extend({
  status: ContractStatusEnum.optional(),
});

export const SignContractSchema = z.object({
  signedById: z.string().cuid(),
  signatureData: z.record(z.unknown()).optional(),
});

export const ContractListQuerySchema = PaginationSchema.extend({
  accountId: z.string().cuid().optional(),
  status: ContractStatusEnum.optional(),
  search: z.string().optional(),
});

// ─── Finance / CPQ — Section 33 + 40 ────────────────────────────────────────

export const CpqPriceRequestSchema = z.object({
  dealId: z.string().cuid().optional(),
  accountId: z.string().cuid(),
  currency: z.string().length(3).default('USD'),
  paymentTerms: z.string().max(50).optional(),
  appliedPromos: z.array(z.string().min(1).max(50)).default([]),
  items: z
    .array(
      z.object({
        productId: z.string().cuid(),
        quantity: z.number().int().min(1),
        competitiveOverridePrice: z.union([z.number(), z.string()]).optional(),
        manualOverridePrice: z.union([z.number(), z.string()]).optional(),
      })
    )
    .min(1),
});

export type InviteUserInput = z.infer<typeof InviteUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;
export type UserListQuery = z.infer<typeof UserListQuerySchema>;
export type CreateDealInput = z.infer<typeof CreateDealSchema>;
export type UpdateDealInput = z.infer<typeof UpdateDealSchema>;
export type MoveDealStageInput = z.infer<typeof MoveDealStageSchema>;
export type MarkDealLostInput = z.infer<typeof MarkDealLostSchema>;
export type AddDealContactInput = z.infer<typeof AddDealContactSchema>;
export type DealListQuery = z.infer<typeof DealListQuerySchema>;
export type MeddicicDataInput = z.infer<typeof MeddicicDataSchema>;
export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;
export type UpdateAccountInput = z.infer<typeof UpdateAccountSchema>;
export type AccountListQuery = z.infer<typeof AccountListQuerySchema>;
export type CreateContactInput = z.infer<typeof CreateContactSchema>;
export type UpdateContactInput = z.infer<typeof UpdateContactSchema>;
export type ContactListQuery = z.infer<typeof ContactListQuerySchema>;
export type CreateLeadInput = z.infer<typeof CreateLeadSchema>;
export type UpdateLeadInput = z.infer<typeof UpdateLeadSchema>;
export type LeadListQuery = z.infer<typeof LeadListQuerySchema>;
export type ConvertLeadInput = z.infer<typeof ConvertLeadSchema>;
export type CreatePipelineInput = z.infer<typeof CreatePipelineSchema>;
export type UpdatePipelineInput = z.infer<typeof UpdatePipelineSchema>;
export type CreateStageInput = z.infer<typeof CreateStageSchema>;
export type UpdateStageInput = z.infer<typeof UpdateStageSchema>;
export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;
export type ProductListQuery = z.infer<typeof ProductListQuerySchema>;
export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof UpdateInvoiceSchema>;
export type InvoiceLineItemInput = z.infer<typeof InvoiceLineItemSchema>;
export type RecordPaymentInput = z.infer<typeof RecordPaymentSchema>;
export type InvoiceListQuery = z.infer<typeof InvoiceListQuerySchema>;
export type CreateContractInput = z.infer<typeof CreateContractSchema>;
export type UpdateContractInput = z.infer<typeof UpdateContractSchema>;
export type SignContractInput = z.infer<typeof SignContractSchema>;
export type ContractListQuery = z.infer<typeof ContractListQuerySchema>;
export type CpqPriceRequestInput = z.infer<typeof CpqPriceRequestSchema>;

// ─── CRM / Activity — Section 33 + 34.2 ─────────────────────────────────────

const ActivityTypeEnum = z.enum([
  'CALL',
  'EMAIL',
  'MEETING',
  'TASK',
  'DEMO',
  'LUNCH',
  'CONFERENCE',
  'FOLLOW_UP',
  'PROPOSAL',
  'NEGOTIATION',
  'NOTE',
]);

const ActivityStatusEnum = z.enum([
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'DEFERRED',
]);

const ActivityPriorityEnum = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);

/**
 * Non-CRM "money object" entity types that Activities / Notes can attach to via
 * the polymorphic `entityType`+`entityId` pair (A1). Native CRM parents
 * (deal/contact/lead/account) keep using their typed id fields.
 */
export const TimelineEntityTypeEnum = z.enum([
  'QUOTE',
  'INVOICE',
  'ORDER',
  'CONTRACT',
  'CAMPAIGN',
]);
export type TimelineEntityType = z.infer<typeof TimelineEntityTypeEnum>;

/** Native + money entity types accepted by the unified timeline endpoint. */
export const TimelineLookupEntityTypeEnum = z.enum([
  'DEAL',
  'CONTACT',
  'LEAD',
  'ACCOUNT',
  'QUOTE',
  'INVOICE',
  'ORDER',
  'CONTRACT',
  'CAMPAIGN',
]);
export type TimelineLookupEntityType = z.infer<
  typeof TimelineLookupEntityTypeEnum
>;

// Task/Meeting first-class fields (B5), shared by create/update.
const ActivitySchedulingFields = {
  location: z.string().max(500).optional(),
  videoLink: z.string().url().max(2000).optional(),
  recurrence: z.string().max(1000).optional(),
  attendees: z.array(z.string().max(320)).max(500).optional(),
  reminderMinutes: z.number().int().min(0).max(43_200).optional(),
};

export const CreateActivitySchema = z
  .object({
    type: ActivityTypeEnum,
    subject: z.string().min(1).max(200),
    description: z.string().max(5000).optional(),
    priority: ActivityPriorityEnum.default('NORMAL'),
    dueDate: z.string().datetime().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    duration: z.number().int().min(0).max(1440).optional(),
    ownerId: z.string().cuid(),
    dealId: z.string().cuid().optional(),
    contactId: z.string().cuid().optional(),
    leadId: z.string().cuid().optional(),
    accountId: z.string().cuid().optional(),
    entityType: TimelineEntityTypeEnum.optional(),
    entityId: z.string().min(1).max(64).optional(),
    ...ActivitySchedulingFields,
    customFields: z.record(z.unknown()).default({}),
  })
  .refine((v) => (v.entityType ? Boolean(v.entityId) : true), {
    message: 'entityId is required when entityType is set',
    path: ['entityId'],
  })
  .refine(
    (v) =>
      Boolean(v.dealId) ||
      Boolean(v.contactId) ||
      Boolean(v.leadId) ||
      Boolean(v.accountId) ||
      (Boolean(v.entityType) && Boolean(v.entityId)),
    { message: 'Activity must be linked to at least one entity' }
  );

export const UpdateActivitySchema = z.object({
  type: ActivityTypeEnum.optional(),
  subject: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  status: ActivityStatusEnum.optional(),
  priority: ActivityPriorityEnum.optional(),
  dueDate: z.string().datetime().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  duration: z.number().int().min(0).max(1440).nullable().optional(),
  outcome: z.string().max(1000).optional(),
  dealId: z.string().cuid().nullable().optional(),
  contactId: z.string().cuid().nullable().optional(),
  leadId: z.string().cuid().nullable().optional(),
  accountId: z.string().cuid().nullable().optional(),
  location: z.string().max(500).nullable().optional(),
  videoLink: z.string().url().max(2000).nullable().optional(),
  recurrence: z.string().max(1000).nullable().optional(),
  attendees: z.array(z.string().max(320)).max(500).optional(),
  reminderMinutes: z.number().int().min(0).max(43_200).nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
});

export const CompleteActivitySchema = z.object({
  outcome: z.string().min(1).max(1000),
});

export const RescheduleActivitySchema = z.object({
  dueDate: z.string().datetime(),
});

export const ActivityListQuerySchema = PaginationSchema.extend({
  dealId: z.string().cuid().optional(),
  contactId: z.string().cuid().optional(),
  leadId: z.string().cuid().optional(),
  accountId: z.string().cuid().optional(),
  entityType: TimelineEntityTypeEnum.optional(),
  entityId: z.string().min(1).max(64).optional(),
  ownerId: z.string().cuid().optional(),
  type: ActivityTypeEnum.optional(),
  status: ActivityStatusEnum.optional(),
  dueBefore: z.string().datetime().optional(),
  dueAfter: z.string().datetime().optional(),
  overdue: z.coerce.boolean().optional(),
});

export const UpcomingActivitiesQuerySchema = z.object({
  ownerId: z.string().cuid(),
  daysAhead: z.coerce.number().int().min(1).max(60).default(7),
});

export type CreateActivityInput = z.infer<typeof CreateActivitySchema>;
export type UpdateActivityInput = z.infer<typeof UpdateActivitySchema>;
export type CompleteActivityInput = z.infer<typeof CompleteActivitySchema>;
export type RescheduleActivityInput = z.infer<typeof RescheduleActivitySchema>;
export type ActivityListQuery = z.infer<typeof ActivityListQuerySchema>;
export type UpcomingActivitiesQuery = z.infer<typeof UpcomingActivitiesQuerySchema>;

// ─── CRM / Note — Section 33 + 34.2 ─────────────────────────────────────────

export const CreateNoteSchema = z
  .object({
    content: z.string().min(1).max(10_000),
    dealId: z.string().cuid().optional(),
    contactId: z.string().cuid().optional(),
    leadId: z.string().cuid().optional(),
    accountId: z.string().cuid().optional(),
    entityType: TimelineEntityTypeEnum.optional(),
    entityId: z.string().min(1).max(64).optional(),
    isPinned: z.boolean().default(false),
    mentions: z.array(z.string().cuid()).default([]),
  })
  .refine((v) => (v.entityType ? Boolean(v.entityId) : true), {
    message: 'entityId is required when entityType is set',
    path: ['entityId'],
  })
  .refine(
    (v) =>
      Boolean(v.dealId) ||
      Boolean(v.contactId) ||
      Boolean(v.leadId) ||
      Boolean(v.accountId) ||
      (Boolean(v.entityType) && Boolean(v.entityId)),
    { message: 'Note must reference at least one entity' }
  );

export const UpdateNoteSchema = z.object({
  content: z.string().min(1).max(10_000).optional(),
  isPinned: z.boolean().optional(),
  mentions: z.array(z.string().cuid()).optional(),
});

export const NoteListQuerySchema = PaginationSchema.extend({
  dealId: z.string().cuid().optional(),
  contactId: z.string().cuid().optional(),
  leadId: z.string().cuid().optional(),
  accountId: z.string().cuid().optional(),
  entityType: TimelineEntityTypeEnum.optional(),
  entityId: z.string().min(1).max(64).optional(),
  authorId: z.string().cuid().optional(),
  isPinned: z.coerce.boolean().optional(),
});

/** Query for the unified timeline endpoint (GET /api/v1/timeline). */
export const TimelineQuerySchema = PaginationSchema.extend({
  entityType: TimelineLookupEntityTypeEnum,
  entityId: z.string().min(1).max(64),
});
export type TimelineQuery = z.infer<typeof TimelineQuerySchema>;

export type CreateNoteInput = z.infer<typeof CreateNoteSchema>;
export type UpdateNoteInput = z.infer<typeof UpdateNoteSchema>;
export type NoteListQuery = z.infer<typeof NoteListQuerySchema>;

// ─── Finance / Quote — Section 33 + 40 ──────────────────────────────────────

const QuoteStatusEnum = z.enum([
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'SENT',
  'VIEWED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'VOID',
  'CONVERTED',
]);

export const DiscountReasonCodeEnum = z.enum([
  'COMPETITIVE_MATCH',
  'STRATEGIC_ACCOUNT',
  'VOLUME_COMMITMENT',
  'MULTI_YEAR_COMMITMENT',
  'NEW_LOGO_ACQUISITION',
  'RENEWAL_SAVE',
  'EXECUTIVE_EXCEPTION',
  'MARKET_ENTRY',
  'BUNDLE_NEGOTIATION',
  'PAYMENT_TERMS_TRADEOFF',
]);

export const DiscountRequestStatusEnum = z.enum([
  'DRAFT',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
]);

export const DiscountRequestPayloadSchema = z.object({
  quoteRevisionId: z.string().cuid().optional(),
  requestedDiscountPercent: z.number().min(0.01).max(80),
  reasonCode: DiscountReasonCodeEnum,
  reasonNotes: z.string().min(10).max(2000),
  winningProbabilityIfApproved: z.number().int().min(1).max(100),
  businessImpact: z.string().max(2000).optional(),
  competitorName: z.string().max(200).optional(),
  expiresAt: z.string().datetime().optional(),
  customFields: z.record(z.unknown()).default({}),
});

export const CreateDiscountRequestSchema = DiscountRequestPayloadSchema.extend({
  quoteId: z.string().cuid(),
  quoteRevisionId: z.string().cuid(),
  requestedById: z.string().cuid().optional(),
});

export const DiscountRequestListQuerySchema = PaginationSchema.extend({
  quoteId: z.string().cuid().optional(),
  requestedById: z.string().cuid().optional(),
  status: DiscountRequestStatusEnum.optional(),
});

export const QuoteLineItemSchema = z.object({
  productId: z.string().cuid(),
  description: z.string().max(500).optional(),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
  discountPercent: z.number().min(0).max(100).default(0),
  taxPercent: z.number().min(0).max(100).default(0),
  isFree: z.boolean().default(false),
});

export const CreateQuoteSchema = z.object({
  rfqId: z.string().cuid().optional(),
  dealId: z.string().cuid(),
  ownerId: z.string().cuid(),
  accountId: z.string().cuid(),
  contactId: z.string().cuid().optional(),
  templateId: z.string().cuid().optional(),
  name: z.string().min(1).max(200),
  currency: z.string().length(3).default('USD'),
  validUntil: z.string().datetime().optional(),
  terms: z.string().max(10_000).optional(),
  notes: z.string().max(5000).optional(),
  paymentTerms: z.string().max(50).optional(),
  appliedPromos: z.array(z.string().min(1).max(50)).default([]),
  discountRequest: DiscountRequestPayloadSchema.optional(),
  items: z
    .array(
      z.object({
        productId: z.string().cuid(),
        quantity: z.number().int().min(1),
        // Optional per-line label + description overrides for line governance;
        // when omitted the line inherits the product's name/description.
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).optional(),
        competitiveOverridePrice: z.union([z.number(), z.string()]).optional(),
        manualOverridePrice: z.union([z.number(), z.string()]).optional(),
      })
    )
    .min(1),
  customFields: z.record(z.unknown()).default({}),
});

export const UpdateQuoteSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  validUntil: z.string().datetime().nullable().optional(),
  terms: z.string().max(10_000).optional(),
  notes: z.string().max(5000).optional(),
  customFields: z.record(z.unknown()).optional(),
  /** When set together with threshold breach, PATCH may respond with HTTP 202 and `requiresApproval`. */
  discountAmount: z.number().min(0).optional(),
  subtotal: z.number().min(0).optional(),
});

export const RejectQuoteSchema = z.object({
  reason: z.string().min(1).max(1000),
});

export const VoidQuoteSchema = z.object({
  reason: z.string().min(1).max(1000),
});

export const QuoteListQuerySchema = PaginationSchema.extend({
  dealId: z.string().cuid().optional(),
  accountId: z.string().cuid().optional(),
  contactId: z.string().cuid().optional(),
  ownerId: z.string().cuid().optional(),
  status: QuoteStatusEnum.optional(),
});

export type CreateQuoteInput = z.infer<typeof CreateQuoteSchema>;
export type UpdateQuoteInput = z.infer<typeof UpdateQuoteSchema>;
export type RejectQuoteInput = z.infer<typeof RejectQuoteSchema>;
export type VoidQuoteInput = z.infer<typeof VoidQuoteSchema>;
export type QuoteListQuery = z.infer<typeof QuoteListQuerySchema>;
export type QuoteLineItem = z.infer<typeof QuoteLineItemSchema>;
export type DiscountReasonCodeInput = z.infer<typeof DiscountReasonCodeEnum>;
export type DiscountRequestStatusInput = z.infer<typeof DiscountRequestStatusEnum>;
export type CreateDiscountRequestInput = z.infer<typeof CreateDiscountRequestSchema>;
export type DiscountRequestPayloadInput = z.infer<typeof DiscountRequestPayloadSchema>;
export type DiscountRequestListQuery = z.infer<typeof DiscountRequestListQuerySchema>;

// ─── Finance / Commission — Section 33 + 41 ─────────────────────────────────

const CommissionStatusEnum = z.enum([
  'PENDING',
  'APPROVED',
  'PAID',
  'DISPUTED',
  'CLAWED_BACK',
]);

export const ClawbackCommissionSchema = z.object({
  reason: z.string().min(1).max(1000),
});

export const CommissionListQuerySchema = PaginationSchema.extend({
  ownerId: z.string().cuid().optional(),
  userId: z.string().cuid().optional(),
  status: CommissionStatusEnum.optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

export const CommissionSummaryQuerySchema = z.object({
  ownerId: z.string().cuid(),
  year: z.coerce.number().int().min(2000).max(2100),
  quarter: z.coerce.number().int().min(1).max(4).optional(),
});

export type ClawbackCommissionInput = z.infer<typeof ClawbackCommissionSchema>;
export type CommissionListQuery = z.infer<typeof CommissionListQuerySchema>;
export type CommissionSummaryQuery = z.infer<typeof CommissionSummaryQuerySchema>;

// ─── CRM / Company ─ Section 33 ─────────────────────────────────────────────

export const CreateCompanySchema = z.object({
  name: z.string().min(1).max(200),
  ownerId: z.string().cuid(),
  website: z.string().url().optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  industry: z.string().max(100).optional(),
  type: z.string().max(40).optional(),
  size: z.string().max(40).optional(),
  annualRevenue: z.number().min(0).optional(),
  employeeCount: z.number().int().min(0).optional(),
  country: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  zipCode: z.string().max(20).optional(),
  linkedInUrl: z.string().url().optional(),
  description: z.string().max(2000).optional(),
  customFields: z.record(z.unknown()).default({}),
  tags: z.array(z.string()).default([]),
});

export const UpdateCompanySchema = CreateCompanySchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const CompanyListQuerySchema = PaginationSchema.extend({
  ownerId: z.string().cuid().optional(),
  type: z.string().optional(),
  industry: z.string().optional(),
  search: z.string().optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export type CreateCompanyInput = z.infer<typeof CreateCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof UpdateCompanySchema>;
export type CompanyListQuery = z.infer<typeof CompanyListQuerySchema>;

// ─── CRM / Tag ─ Section 33 ─────────────────────────────────────────────────

export const CreateTagSchema = z.object({
  tenantId: z.string().min(1).optional(),
  name: z.string().min(1).max(100),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  entityType: z.string().max(40).optional(),
});

export const UpdateTagSchema = CreateTagSchema.partial().omit({ tenantId: true });

export type CreateTagInput = z.infer<typeof CreateTagSchema>;
export type UpdateTagInput = z.infer<typeof UpdateTagSchema>;

// ─── CRM / Custom Field ─ Section 33 ────────────────────────────────────────

// ─── Advanced custom-field configs (Zoho-parity engine) ──────────────────────
// Type-specific configuration carried in `CustomFieldDefinition.config` (JSON).
// Each sub-schema is optional at the object level; field-integrity.ts enforces
// which keys are required for a given fieldType. Kept permissive (passthrough)
// so the low-code UI can round-trip forward-compatible extra keys.

/** Aggregation function for ROLLUP_SUMMARY fields. */
export const RollupFunctionSchema = z.enum(['COUNT', 'SUM', 'MIN', 'MAX', 'AVG']);
export type RollupFunction = z.infer<typeof RollupFunctionSchema>;

/** Rollup-summary config: aggregate a child/related set into this field. */
export const RollupConfigSchema = z.object({
  function: RollupFunctionSchema,
  // Related module/entity whose records are aggregated (apiName).
  childModule: z.string().min(1).max(120),
  // Field on the child record to aggregate. Required for SUM/MIN/MAX/AVG.
  childField: z.string().max(120).optional(),
  // Lookup field on the child that links back to the parent record.
  linkField: z.string().min(1).max(120),
  // Optional simple equality filter applied to child rows before aggregating.
  filter: z.record(z.unknown()).optional(),
});
export type RollupConfigInput = z.infer<typeof RollupConfigSchema>;

/** One field definition inside a SUBFORM (repeating line-item grid). */
export const SubformFieldSchema = z.object({
  apiName: z.string().min(1).max(120),
  label: z.string().min(1).max(120),
  type: z.string().min(1).max(40),
  required: z.boolean().optional(),
  options: z.array(z.unknown()).optional(),
  defaultValue: z.unknown().optional(),
});
export type SubformFieldInput = z.infer<typeof SubformFieldSchema>;

/** Subform config: embedded repeating child-record grid. */
export const SubformConfigSchema = z.object({
  fields: z.array(SubformFieldSchema).min(1),
  minRows: z.number().int().min(0).optional(),
  maxRows: z.number().int().min(1).optional(),
});
export type SubformConfigInput = z.infer<typeof SubformConfigSchema>;

/** Type-specific config for an advanced custom field. Passthrough-tolerant. */
export const CustomFieldConfigSchema = z
  .object({
    // LOOKUP / MULTI_LOOKUP
    lookupModule: z.string().min(1).max(120).optional(),
    displayField: z.string().max(120).optional(),
    // MULTI_LOOKUP
    junctionModule: z.string().max(120).optional(),
    maxSelections: z.number().int().min(1).optional(),
    // SUBFORM
    subform: SubformConfigSchema.optional(),
    // ROLLUP_SUMMARY
    rollup: RollupConfigSchema.optional(),
    // DEPENDENT_PICKLIST (controlling/parent field apiKey)
    controllingField: z.string().max(120).optional(),
    // GLOBAL SET reference (shared picklist)
    globalSetId: z.string().min(1).optional(),
  })
  .passthrough();
export type CustomFieldConfigInput = z.infer<typeof CustomFieldConfigSchema>;

export const CreateCustomFieldSchema = z.object({
  tenantId: z.string().min(1).optional(),
  entityType: z.string().min(1).max(40),
  name: z.string().min(1).max(100),
  apiKey: z.string().min(1).max(100),
  fieldType: z.string().min(1).max(40),
  options: z.array(z.record(z.unknown())).default([]),
  required: z.boolean().default(false),
  showOnCard: z.boolean().default(false),
  position: z.number().int().min(0).default(0),
  // Advanced field-type configuration (lookup/rollup/subform/dependent/etc.).
  config: CustomFieldConfigSchema.optional(),
  // Shortcut reference to a shared GlobalPicklistSet (also mirrored in config).
  globalSetId: z.string().min(1).nullish(),
});

export const UpdateCustomFieldSchema = CreateCustomFieldSchema.partial().omit({ tenantId: true, entityType: true });

export type CreateCustomFieldInput = z.infer<typeof CreateCustomFieldSchema>;
export type UpdateCustomFieldInput = z.infer<typeof UpdateCustomFieldSchema>;

/** Body for POST /custom-fields/:id/rollup/recompute — supply the child rows
 *  (or pre-extracted numeric values) the aggregate is computed from. */
export const RollupRecomputeSchema = z.object({
  rows: z.array(z.record(z.unknown())).optional(),
  values: z.array(z.number()).optional(),
});
export type RollupRecomputeInput = z.infer<typeof RollupRecomputeSchema>;

// ─── Global picklist sets (tenant-level shared option lists) ──────────────────
export const GlobalPicklistOptionSchema = z.union([
  z.string().min(1),
  z
    .object({
      value: z.string().min(1),
      label: z.string().optional(),
    })
    .passthrough(),
]);

export const CreateGlobalPicklistSetSchema = z.object({
  name: z.string().min(1).max(120),
  options: z.array(GlobalPicklistOptionSchema).default([]),
  isActive: z.boolean().optional(),
});
export const UpdateGlobalPicklistSetSchema = CreateGlobalPicklistSetSchema.partial();

export type CreateGlobalPicklistSetInput = z.infer<typeof CreateGlobalPicklistSetSchema>;
export type UpdateGlobalPicklistSetInput = z.infer<typeof UpdateGlobalPicklistSetSchema>;

// ─── Reusable Address — Section 33 ───────────────────────────────────────────

export const AddressSchema = z.object({
  line1: z.string().max(500).optional(),
  line2: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const BillingAddressSchema = AddressSchema.extend({
  isPrimary: z.boolean().optional(),
});

export const ShippingAddressSchema = AddressSchema.extend({
  sameAsBilling: z.boolean().optional(),
  shippingInstructions: z.string().max(1000).optional(),
});

export type AddressInput = z.infer<typeof AddressSchema>;
export type BillingAddressInput = z.infer<typeof BillingAddressSchema>;
export type ShippingAddressInput = z.infer<typeof ShippingAddressSchema>;

// ─── Coding Rules — Section 33 ───────────────────────────────────────────────

export const CodingRuleTokenSchema = z.object({
  type: z.enum([
    'PREFIX',
    'YYYY',
    'YY',
    'MM',
    'DD',
    'Q',
    'TERRITORY',
    'BRANCH',
    'DEPT',
    'OWNER_INITIALS',
    'SEQ',
    'CATEGORY',
    'TEXT',
  ]),
  value: z.string().optional(),
  digits: z.number().int().min(1).max(12).optional(),
});

export const CreateCodingRuleSchema = z.object({
  tenantId: z.string().min(1).optional(),
  entityType: z.string().min(1).max(40),
  name: z.string().min(1).max(100),
  prefix: z.string().max(20).default(''),
  pattern: z.string().min(1).max(200),
  separator: z.string().max(5).default('-'),
  sequenceScope: z.enum(['TENANT', 'MODULE', 'YEAR', 'MONTH', 'TERRITORY', 'BRANCH', 'TEAM', 'CATEGORY']).default('TENANT'),
  resetPolicy: z.enum(['NEVER', 'YEARLY', 'MONTHLY', 'DAILY']).default('NEVER'),
  nextSequence: z.number().int().min(1).default(1),
  isManualOverrideAllowed: z.boolean().default(false),
  isRequired: z.boolean().default(true),
  lockedAfterCreate: z.boolean().default(true),
  fallbackStrategy: z.enum(['BLOCK', 'USE_DEFAULT', 'USE_TIMESTAMP']).default('USE_DEFAULT'),
  isActive: z.boolean().default(true),
  effectiveFrom: z.string().datetime().optional().transform((v) => v ? new Date(v) : null),
});

export const UpdateCodingRuleSchema = CreateCodingRuleSchema.partial().omit({ tenantId: true, entityType: true });

export const PreviewCodingRuleSchema = z.object({
  sampleInputs: z.record(z.unknown()).default({}),
});

export const AllocateCodeSchema = z.object({
  tenantId: z.string().min(1),
  ownerId: z.string().cuid().optional(),
  territoryId: z.string().cuid().optional(),
  branchId: z.string().cuid().optional(),
  teamId: z.string().cuid().optional(),
  category: z.string().optional(),
  manualCode: z.string().max(100).optional(),
});

export type CreateCodingRuleInput = z.infer<typeof CreateCodingRuleSchema>;
export type UpdateCodingRuleInput = z.infer<typeof UpdateCodingRuleSchema>;
export type PreviewCodingRuleInput = z.infer<typeof PreviewCodingRuleSchema>;
export type AllocateCodeInput = z.infer<typeof AllocateCodeSchema>;

// ─── Document Templates — Section 33 ─────────────────────────────────────────

export const CreateDocumentTemplateSchema = z.object({
  tenantId: z.string().min(1).optional(),
  module: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  sourceFormat: z.enum(['DOCX', 'HTML', 'MARKDOWN']).default('HTML'),
  templateBody: z.string().max(50_000).optional(),
  mergeFields: z.array(z.string()).default([]),
  header: z.string().max(2000).optional(),
  footer: z.string().max(2000).optional(),
  locale: z.string().max(10).default('en'),
  currency: z.string().length(3).default('USD'),
  pageSize: z.enum(['A4', 'LETTER']).default('A4'),
  orientation: z.enum(['PORTRAIT', 'LANDSCAPE']).default('PORTRAIT'),
});

export const UpdateDocumentTemplateSchema = CreateDocumentTemplateSchema.partial().omit({ tenantId: true, module: true });

export const RenderTemplateSchema = z.object({
  data: z.record(z.unknown()).default({}),
});

export type CreateDocumentTemplateInput = z.infer<typeof CreateDocumentTemplateSchema>;
export type UpdateDocumentTemplateInput = z.infer<typeof UpdateDocumentTemplateSchema>;
export type RenderTemplateInput = z.infer<typeof RenderTemplateSchema>;

// ─── Import / Export — Section 33 ────────────────────────────────────────────

export const ImportPreviewSchema = z.object({
  fileBase64: z.string().min(1),
  fieldMap: z.record(z.string()).default({}),
  duplicateStrategy: z.enum(['SKIP', 'UPDATE', 'CREATE', 'MERGE']).default('SKIP'),
  previewLimit: z.number().int().min(1).max(100).default(10),
});

export const ImportRunSchema = z.object({
  fileBase64: z.string().min(1),
  fieldMap: z.record(z.string()).default({}),
  duplicateStrategy: z.enum(['SKIP', 'UPDATE', 'CREATE', 'MERGE']).default('SKIP'),
});

export const ExportRequestSchema = z.object({
  format: z.enum(['CSV', 'XLSX']).default('CSV'),
  columns: z.array(z.string()).optional(),
  selectedIds: z.array(z.string().cuid()).optional(),
  filters: z.record(z.unknown()).optional(),
});

export type ImportPreviewInput = z.infer<typeof ImportPreviewSchema>;
export type ImportRunInput = z.infer<typeof ImportRunSchema>;
export type ExportRequestInput = z.infer<typeof ExportRequestSchema>;

// ─── Billing / Integration / Blueprint — Phase 5 ─────────────────────────────

export * from './integration.schema.js';
export * from './blueprint.schema.js';
