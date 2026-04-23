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
  source: z.string().optional(),
  campaignId: z.string().cuid().optional(),
  contactIds: z.array(z.string().cuid()).default([]),
  customFields: z.record(z.unknown()).default({}),
  tags: z.array(z.string()).default([]),
});

export const UpdateDealSchema = CreateDealSchema.partial().extend({
  status: z.enum(['OPEN', 'WON', 'LOST', 'DORMANT']).optional(),
  lostReason: z.string().optional(),
  forecastCategory: z
    .enum(['PIPELINE', 'BEST_CASE', 'COMMIT', 'CLOSED', 'OMITTED'])
    .optional(),
  meddicicData: z.record(z.unknown()).optional(),
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
const AccountStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'CHURNED']);

export const CreateAccountSchema = z.object({
  name: z.string().min(1).max(200),
  ownerId: z.string().cuid(),
  parentAccountId: z.string().cuid().optional(),
  website: z.string().url().optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  industry: z.string().max(100).optional(),
  type: AccountTypeEnum.default('PROSPECT'),
  tier: AccountTierEnum.default('SMB'),
  status: AccountStatusEnum.default('ACTIVE'),
  annualRevenue: z.number().min(0).optional(),
  employeeCount: z.number().int().min(0).optional(),
  country: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  zipCode: z.string().max(20).optional(),
  linkedInUrl: z.string().url().optional(),
  description: z.string().max(2000).optional(),
  sicCode: z.string().max(20).optional(),
  naicsCode: z.string().max(20).optional(),
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
  accountId: z.string().cuid().optional(),
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

export const CreateStageSchema = z.object({
  name: z.string().min(1).max(100),
  order: z.number().int().min(0),
  probability: z.number().int().min(0).max(100).default(0),
  rottenDays: z.number().int().min(1).default(30),
  requiredFields: z.array(z.string()).default([]),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default('#6B7280'),
});

export const UpdateStageSchema = CreateStageSchema.partial();

export const CreatePipelineSchema = z.object({
  name: z.string().min(1).max(100),
  currency: z.string().length(3).default('USD'),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
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
  description: z.string().max(2000).optional(),
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
    customFields: z.record(z.unknown()).default({}),
  })
  .refine(
    (v) =>
      Boolean(v.dealId) ||
      Boolean(v.contactId) ||
      Boolean(v.leadId) ||
      Boolean(v.accountId),
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
    isPinned: z.boolean().default(false),
  })
  .refine(
    (v) =>
      Boolean(v.dealId) ||
      Boolean(v.contactId) ||
      Boolean(v.leadId) ||
      Boolean(v.accountId),
    { message: 'Note must reference at least one entity' }
  );

export const UpdateNoteSchema = z.object({
  content: z.string().min(1).max(10_000).optional(),
  isPinned: z.boolean().optional(),
});

export const NoteListQuerySchema = PaginationSchema.extend({
  dealId: z.string().cuid().optional(),
  contactId: z.string().cuid().optional(),
  leadId: z.string().cuid().optional(),
  accountId: z.string().cuid().optional(),
  authorId: z.string().cuid().optional(),
  isPinned: z.coerce.boolean().optional(),
});

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
  dealId: z.string().cuid(),
  ownerId: z.string().cuid(),
  accountId: z.string().cuid(),
  name: z.string().min(1).max(200),
  currency: z.string().length(3).default('USD'),
  validUntil: z.string().datetime().optional(),
  terms: z.string().max(10_000).optional(),
  notes: z.string().max(5000).optional(),
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
  customFields: z.record(z.unknown()).default({}),
});

export const UpdateQuoteSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  validUntil: z.string().datetime().nullable().optional(),
  terms: z.string().max(10_000).optional(),
  notes: z.string().max(5000).optional(),
  customFields: z.record(z.unknown()).optional(),
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
  ownerId: z.string().cuid().optional(),
  status: QuoteStatusEnum.optional(),
});

export type CreateQuoteInput = z.infer<typeof CreateQuoteSchema>;
export type UpdateQuoteInput = z.infer<typeof UpdateQuoteSchema>;
export type RejectQuoteInput = z.infer<typeof RejectQuoteSchema>;
export type VoidQuoteInput = z.infer<typeof VoidQuoteSchema>;
export type QuoteListQuery = z.infer<typeof QuoteListQuerySchema>;
export type QuoteLineItem = z.infer<typeof QuoteLineItemSchema>;

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
