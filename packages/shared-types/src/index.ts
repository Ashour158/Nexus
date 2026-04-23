// ─── Tenant & Auth — Section 32 ─────────────────────────────────────────────

export interface TenantContext {
  tenantId: string;
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
  plan: string;
}

export interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  roles: string[];
  /** Resolved permission strings; included in app-issued JWT for RBAC (Section 35.2). */
  permissions?: string[];
  iat?: number;
  exp?: number;
}

// ─── Pagination — Section 32 ────────────────────────────────────────────────

export interface PaginationInput {
  page?: number;
  limit?: number;
  cursor?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface CursorPaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  prevCursor: string | null;
  hasMore: boolean;
}

// ─── API Responses — Section 32 ──────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Kafka Events — Section 32 ──────────────────────────────────────────────

export interface KafkaEventBase {
  eventId: string;
  tenantId: string;
  timestamp: string;
  version: number;
  source: string;
  correlationId?: string;
}

export interface LeadCreatedEvent extends KafkaEventBase {
  type: 'lead.created';
  payload: {
    leadId: string;
    ownerId: string;
    email?: string;
    source: string;
  };
}

export interface DealCreatedEvent extends KafkaEventBase {
  type: 'deal.created';
  payload: {
    dealId: string;
    ownerId: string;
    accountId: string;
    amount: number;
    currency: string;
    pipelineId: string;
    stageId: string;
  };
}

export interface DealStageChangedEvent extends KafkaEventBase {
  type: 'deal.stage_changed';
  payload: {
    dealId: string;
    previousStageId: string;
    newStageId: string;
    ownerId: string;
    amount: number;
  };
}

export interface DealWonEvent extends KafkaEventBase {
  type: 'deal.won';
  payload: {
    dealId: string;
    ownerId: string;
    accountId: string;
    amount: number;
    currency: string;
  };
}

export interface DealLostEvent extends KafkaEventBase {
  type: 'deal.lost';
  payload: {
    dealId: string;
    ownerId: string;
    reason: string;
    amount: number;
  };
}

export interface ContactCreatedEvent extends KafkaEventBase {
  type: 'contact.created';
  payload: { contactId: string; email?: string; accountId?: string };
}

export interface ActivityCompletedEvent extends KafkaEventBase {
  type: 'activity.completed';
  payload: {
    activityId: string;
    type: string;
    ownerId: string;
    dealId?: string;
    contactId?: string;
    outcome?: string;
  };
}

export interface ActivityCreatedEvent extends KafkaEventBase {
  type: 'activity.created';
  payload: {
    activityId: string;
    type: string;
    ownerId: string;
    dealId?: string | null;
    contactId?: string | null;
    leadId?: string | null;
    dueDate?: string | null;
  };
}

export interface QuoteCreatedEvent extends KafkaEventBase {
  type: 'quote.created';
  payload: {
    quoteId: string;
    dealId: string;
    accountId: string;
    total: number;
    currency: string;
  };
}

export interface QuoteSentEvent extends KafkaEventBase {
  type: 'quote.sent';
  payload: {
    quoteId: string;
    dealId: string;
    accountId: string;
    total: number;
    recipientEmail?: string;
  };
}

export interface QuoteRejectedEvent extends KafkaEventBase {
  type: 'quote.rejected';
  payload: {
    quoteId: string;
    dealId: string;
    total: number;
    reason: string;
  };
}

export interface QuoteVoidedEvent extends KafkaEventBase {
  type: 'quote.voided';
  payload: {
    quoteId: string;
    dealId: string;
    reason: string;
  };
}

export interface CommissionCalculatedEvent extends KafkaEventBase {
  type: 'commission.calculated';
  payload: {
    commissionId: string;
    userId: string;
    dealId: string;
    baseAmount: number;
    finalAmount: number;
    currency: string;
  };
}

export interface CommissionApprovedEvent extends KafkaEventBase {
  type: 'commission.approved';
  payload: {
    commissionId: string;
    userId: string;
    finalAmount: number;
  };
}

export interface CommissionClawbackEvent extends KafkaEventBase {
  type: 'commission.clawback';
  payload: {
    commissionId: string;
    userId: string;
    originalAmount: number;
    reason: string;
  };
}

export interface QuoteAcceptedEvent extends KafkaEventBase {
  type: 'quote.accepted';
  payload: {
    quoteId: string;
    dealId: string;
    total: number;
    currency: string;
  };
}

export interface InvoiceCreatedEvent extends KafkaEventBase {
  type: 'invoice.created';
  payload: { invoiceId: string; accountId: string; total: number; dueDate: string };
}

export interface InvoicePaidEvent extends KafkaEventBase {
  type: 'invoice.paid';
  payload: { invoiceId: string; accountId: string; amount: number };
}

export interface SubscriptionCreatedEvent extends KafkaEventBase {
  type: 'subscription.created';
  payload: { subscriptionId: string; accountId: string; mrr: number };
}

export interface SubscriptionCancelledEvent extends KafkaEventBase {
  type: 'subscription.cancelled';
  payload: { subscriptionId: string; accountId: string; mrr: number; reason?: string };
}

export type NexusKafkaEvent =
  | LeadCreatedEvent
  | DealCreatedEvent
  | DealStageChangedEvent
  | DealWonEvent
  | DealLostEvent
  | ContactCreatedEvent
  | ActivityCreatedEvent
  | ActivityCompletedEvent
  | QuoteCreatedEvent
  | QuoteSentEvent
  | QuoteAcceptedEvent
  | QuoteRejectedEvent
  | QuoteVoidedEvent
  | CommissionCalculatedEvent
  | CommissionApprovedEvent
  | CommissionClawbackEvent
  | InvoiceCreatedEvent
  | InvoicePaidEvent
  | SubscriptionCreatedEvent
  | SubscriptionCancelledEvent;

// ─── CRM Domain Types — Section 32 ───────────────────────────────────────────

export type LeadStatusLiteral =
  | 'NEW'
  | 'ASSIGNED'
  | 'WORKING'
  | 'QUALIFIED'
  | 'UNQUALIFIED'
  | 'CONVERTED';

export type DealStatusLiteral = 'OPEN' | 'WON' | 'LOST' | 'DORMANT';

export type ForecastCategoryLiteral =
  | 'PIPELINE'
  | 'BEST_CASE'
  | 'COMMIT'
  | 'CLOSED'
  | 'OMITTED';

export type ActivityTypeLiteral =
  | 'CALL'
  | 'EMAIL'
  | 'MEETING'
  | 'TASK'
  | 'DEMO'
  | 'LUNCH'
  | 'CONFERENCE'
  | 'FOLLOW_UP'
  | 'PROPOSAL'
  | 'NEGOTIATION'
  | 'NOTE';

/** MEDDIC qualification structure stored on `Deal.meddicicData` (Section 32). */
export interface MeddicicData {
  metrics: { score: number; notes: string };
  economicBuyer: { identified: boolean; name?: string; notes: string };
  decisionCriteria: { score: number; notes: string };
  decisionProcess: { score: number; notes: string };
  paperProcess: { score: number; notes: string };
  identifyPain: { score: number; notes: string };
  champion: { identified: boolean; name?: string; notes: string };
  competition: { identified: boolean; competitors: string[]; notes: string };
  totalScore: number;
}

// ─── Domain Read-Models (frontend / API wire types) — Section 31.2 ───────────
//
// Wire-shape (JSON-serialized) mirrors of the Prisma models used by the CRM
// UI. Dates are ISO-8601 strings and monetary Decimal values are carried as
// strings to preserve precision across the JSON boundary.

export interface Pipeline {
  id: string;
  tenantId: string;
  name: string;
  currency: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Stage {
  id: string;
  tenantId: string;
  pipelineId: string;
  name: string;
  order: number;
  probability: number;
  rottenDays: number;
  requiredFields: unknown;
  entryConditions: unknown;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface Account {
  id: string;
  tenantId: string;
  ownerId: string;
  parentAccountId: string | null;
  name: string;
  website: string | null;
  phone: string | null;
  email: string | null;
  industry: string | null;
  type: 'PROSPECT' | 'CUSTOMER' | 'PARTNER' | 'COMPETITOR' | 'OTHER';
  tier: 'SMB' | 'MID_MARKET' | 'ENTERPRISE' | 'STRATEGIC';
  status: 'ACTIVE' | 'INACTIVE' | 'CHURNED';
  annualRevenue: string | null;
  employeeCount: number | null;
  country: string | null;
  city: string | null;
  address: string | null;
  zipCode: string | null;
  linkedInUrl: string | null;
  description: string | null;
  sicCode: string | null;
  naicsCode: string | null;
  healthScore: number | null;
  npsScore: number | null;
  customFields: Record<string, unknown>;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  tenantId: string;
  ownerId: string;
  accountId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  jobTitle: string | null;
  department: string | null;
  linkedInUrl: string | null;
  twitterHandle: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  timezone: string | null;
  preferredChannel: string | null;
  doNotEmail: boolean;
  doNotCall: boolean;
  gdprConsent: boolean;
  gdprConsentAt: string | null;
  lastContactedAt: string | null;
  customFields: Record<string, unknown>;
  tags: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Deal {
  id: string;
  tenantId: string;
  ownerId: string;
  accountId: string;
  pipelineId: string;
  stageId: string;
  name: string;
  amount: string;
  currency: string;
  probability: number;
  expectedCloseDate: string | null;
  actualCloseDate: string | null;
  status: DealStatusLiteral;
  lostReason: string | null;
  lostDetail: string | null;
  forecastCategory: ForecastCategoryLiteral;
  meddicicScore: number;
  meddicicData: MeddicicData | Record<string, unknown>;
  aiWinProbability: number | null;
  aiInsights: unknown;
  competitors: string[];
  source: string | null;
  campaignId: string | null;
  customFields: Record<string, unknown>;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Lead / Activity / Note wire types — Section 31.2 ──────────────────────

export type LeadSourceLiteral =
  | 'WEBSITE'
  | 'REFERRAL'
  | 'OUTBOUND'
  | 'EVENT'
  | 'PARTNER'
  | 'OTHER';

export interface Lead {
  id: string;
  tenantId: string;
  ownerId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  status: LeadStatusLiteral;
  source: LeadSourceLiteral | string;
  score: number;
  aiScore: number | null;
  convertedAt: string | null;
  convertedToContactId: string | null;
  convertedToAccountId: string | null;
  convertedToDealId: string | null;
  disqualifiedReason: string | null;
  customFields: Record<string, unknown>;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export type ActivityStatusLiteral =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DEFERRED';

export type ActivityPriorityLiteral = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface Activity {
  id: string;
  tenantId: string;
  ownerId: string;
  type: ActivityTypeLiteral;
  subject: string;
  description: string | null;
  priority: ActivityPriorityLiteral;
  status: ActivityStatusLiteral;
  dueDate: string | null;
  startDate: string | null;
  endDate: string | null;
  completedAt: string | null;
  duration: number | null;
  outcome: string | null;
  dealId: string | null;
  contactId: string | null;
  leadId: string | null;
  accountId: string | null;
  customFields: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  tenantId: string;
  authorId: string;
  content: string;
  isPinned: boolean;
  dealId: string | null;
  contactId: string | null;
  leadId: string | null;
  accountId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Account Health — Section 32 (CS / Renewal scoring) ─────────────────────

/**
 * Health snapshot returned by `GET /accounts/:id/health` (Section 34.2).
 *
 * The score is 0–100 and the `factors` array surfaces the underlying signals
 * (NPS, last-touch recency, MRR trend, support tickets, etc.) so the UI can
 * render an explainable breakdown.
 */
export interface AccountHealthInsight {
  accountId: string;
  /** Composite health score (0–100). */
  score: number;
  /** Categorical bucket derived from `score`. */
  status: 'HEALTHY' | 'AT_RISK' | 'CHURNING' | 'UNKNOWN';
  /** Net Promoter Score (-100..100), if available. */
  npsScore: number | null;
  /** Days since the last logged customer interaction, if available. */
  daysSinceLastTouch: number | null;
  /** Open support ticket count, if available. */
  openSupportTickets: number | null;
  /** Per-signal breakdown shown in the UI. */
  factors: Array<{
    code: string;
    label: string;
    value: number | string | null;
    impact: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  }>;
  /** ISO timestamp of when the score was computed. */
  computedAt: string;
}

// ─── CPQ / Pricing — Section 32 ─────────────────────────────────────────────

/** One priced line in a CPQ quote result (Section 40). */
export interface CpqLineItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  /** List price per unit (pre-discount, pre-tax). */
  listPrice: number;
  /** Final unit price after the waterfall applies (pre-tax). */
  unitPrice: number;
  /** Effective discount % from list → unitPrice. */
  discountPercent: number;
  /** Per-unit discount amount (list − unit). */
  discountAmount: number;
  /** Line total = `unitPrice × quantity`. */
  total: number;
  billingType: string;
  notes?: string;
}

/**
 * CPQ pricing input. `items[*].competitiveOverridePrice` and
 * `items[*].manualOverridePrice` are optional per-line overrides consumed by
 * rules 6 (competitive) and 8 (non-standard approval) respectively.
 */
export interface CpqPricingRequest {
  tenantId: string;
  dealId?: string;
  accountId: string;
  items: Array<{
    productId: string;
    quantity: number;
    /** Rule 6 — competitor quote used to match. */
    competitiveOverridePrice?: number | string;
    /** Rule 8 — sales-entered override (triggers approval flow when lower). */
    manualOverridePrice?: number | string;
  }>;
  appliedPromos?: string[];
  /** Matches `PaymentTerm` tokens — NET_0 / PREPAID trigger rule 9. */
  paymentTerms?: string;
  currency: string;
}

export interface CpqPricingResult {
  items: CpqLineItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  appliedRules: string[];
  floorPriceWarnings: string[];
  approvalRequired: boolean;
  approvalReasons: string[];
}

// ─── Timeline Events — used by Deal / Contact / Account 360-views ─────────────

/**
 * A unified event on a domain object's timeline.
 * Sources include activities, notes, stage changes, won/lost transitions, etc.
 */
export interface TimelineEvent {
  id: string;
  /** Source category (what produced this event). */
  type: 'ACTIVITY' | 'NOTE' | 'STAGE_CHANGE' | 'STATUS_CHANGE' | 'CREATED';
  /** ISO-8601 timestamp — the canonical time the event happened. */
  at: string;
  /** Short human-readable summary. */
  title: string;
  /** Optional longer body text. */
  description?: string;
  /** Actor (user id) associated with the event, if known. */
  actorId?: string;
  /** Structured metadata (activity type, stage ids, status values, etc.). */
  metadata?: Record<string, unknown>;
}
