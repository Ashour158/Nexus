import { resolveDevPreviewEnabled } from './dev-preview-guard';

export const DEV_PREVIEW_ENABLED = resolveDevPreviewEnabled();

type DevRole = {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  isSystem: boolean;
};

type DevUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  roles: Array<{ id: string; name: string }>;
  phone?: string;
  timezone?: string;
  language?: string;
  lastLoginAt?: string;
};

type DevProfile = DevUser & {
  locale: string;
  avatarUrl: string | null;
  profile: Record<string, unknown>;
  userRoles: Array<{ role: { id: string; name: string } }>;
};

type ScoringRule = {
  id: string;
  name: string;
  signal: string;
  points: number;
  isActive: boolean;
};

type QuoteAutomationRule = {
  id: string;
  name: string;
  trigger: string;
  isActive: boolean;
  conditions?: Record<string, unknown>;
  actions?: Array<Record<string, unknown>>;
};

type DevStage = {
  id: string;
  name: string;
  order: number;
  probability: number;
  rottenDays: number;
  color: string;
};

type DevPipeline = {
  id: string;
  name: string;
  currency: string;
  isDefault: boolean;
  isActive: boolean;
  stages: DevStage[];
};

type DevProduct = {
  id: string;
  name: string;
  nameAr?: string | null;
  sku: string;
  currency: string;
  listPrice: number;
  isActive: boolean;
  type: string;
  billingType: string;
  taxable: boolean;
};

type DevProductKit = {
  id: string;
  name: string;
  sku: string;
  currency: string;
  listPrice: number;
  items: Array<{ productId: string; quantity: number }>;
};

type DevVendor = {
  id: string;
  name: string;
  code: string;
  currency: string;
  isActive: boolean;
  products: string[];
};

type DevCurrency = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  isBase: boolean;
  isActive: boolean;
  decimalPlaces: number;
};

type DevTaxZone = {
  id: string;
  name: string;
  country?: string | null;
};

type DevTaxRate = {
  id: string;
  zoneId: string;
  name: string;
  code: string;
  rate: number;
};

type DevAccount = Record<string, unknown> & {
  id: string;
  tenantId: string;
  ownerId: string;
  code: string;
  name: string;
  type: 'PROSPECT' | 'CUSTOMER' | 'PARTNER' | 'COMPETITOR' | 'OTHER';
  tier: 'SMB' | 'MID_MARKET' | 'ENTERPRISE' | 'STRATEGIC';
  status: 'ACTIVE' | 'INACTIVE' | 'AT_RISK' | 'CHURNED';
  customFields: Record<string, unknown>;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  legalName?: string | null;
  tradeName?: string | null;
  website?: string | null;
  phone?: string | null;
  fax?: string | null;
  email?: string | null;
  industry?: string | null;
  subIndustry?: string | null;
  lifecycleStage?: string | null;
  annualRevenue?: string | null;
  employeeCount?: number | null;
  foundedYear?: number | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  zipCode?: string | null;
  linkedInUrl?: string | null;
  description?: string | null;
  sicCode?: string | null;
  naicsCode?: string | null;
  taxId?: string | null;
  vatNumber?: string | null;
  commercialRegistrationNumber?: string | null;
  paymentTerms?: string | null;
  creditLimit?: string | null;
  currency?: string | null;
  priceBookId?: string | null;
  territoryId?: string | null;
  healthScore?: number | null;
  npsScore?: number | null;
  riskLevel?: string | null;
  lastActivityAt?: string | null;
  billingAddressLine1?: string | null;
  billingAddressLine2?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingPostalCode?: string | null;
  billingCountry?: string | null;
  billingLatitude?: number | null;
  billingLongitude?: number | null;
  shippingAddressLine1?: string | null;
  shippingAddressLine2?: string | null;
  shippingCity?: string | null;
  shippingState?: string | null;
  shippingPostalCode?: string | null;
  shippingCountry?: string | null;
  shippingLatitude?: number | null;
  shippingLongitude?: number | null;
  shippingInstructions?: string | null;
  sameAsBilling?: boolean | null;
};

type DevDeal = Record<string, unknown> & {
  id: string;
  ownerId: string;
  code: string;
  accountId: string;
  pipelineId: string;
  stageId: string;
  name: string;
  accountName: string;
  amount: string;
  status: 'OPEN' | 'WON' | 'LOST' | 'DORMANT';
  createdAt: string;
  updatedAt: string;
};

type DevContact = Record<string, unknown> & {
  id: string;
  ownerId: string;
  code: string;
  accountId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
};

type DevLead = Record<string, unknown> & {
  id: string;
  tenantId: string;
  ownerId: string | null;
  code: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  status: string;
  source: string;
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
};

type DevActivity = Record<string, unknown> & {
  id: string;
  ownerId: string;
  type: string;
  subject: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  tenantId?: string;
  code?: string;
};

type DevQuote = Record<string, unknown> & {
  id: string;
  tenantId: string;
  dealId: string;
  accountId: string;
  contactId?: string | null;
  rfqId?: string | null;
  ownerId: string;
  quoteNumber: string;
  name: string;
  status: string;
  currency: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

type DevDiscountRequest = Record<string, unknown> & {
  id: string;
  tenantId: string;
  quoteId: string;
  requestedById: string;
  approvalRequestId?: string | null;
  status: string;
  reasonCode: string;
  reasonLabel: string;
  requestedDiscountPercent: string;
  requestedDiscountAmount: string;
  winningProbabilityIfApproved: number;
  createdAt: string;
  updatedAt: string;
};

type DevQuoteRevision = Record<string, unknown> & {
  id: string;
  tenantId: string;
  quoteId: string;
  version: number;
  reason: string;
  status: string;
  snapshot: Record<string, unknown>;
  createdAt: string;
};

type DevQuoteTemplate = Record<string, unknown> & {
  id: string;
  tenantId: string;
  name: string;
  version: number;
  status: string;
  language: string;
  isDefault: boolean;
  isActive: boolean;
  body?: string | null;
  createdAt: string;
  updatedAt: string;
};

type DevQuoteDocument = Record<string, unknown> & {
  id: string;
  tenantId: string;
  quoteId: string;
  templateId?: string | null;
  format: string;
  status: string;
  fileName: string;
  contentType: string;
  renderedHtml?: string | null;
  contentBase64?: string | null;
  contentSize?: number | null;
  checksum?: string | null;
  createdAt: string;
  updatedAt: string;
};

type DevQuoteESignEnvelope = Record<string, unknown> & {
  id: string;
  tenantId: string;
  quoteId: string;
  documentId?: string | null;
  status: string;
  recipientName: string;
  recipientEmail: string;
  sentById: string;
  sentAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type DevOrder = Record<string, unknown> & {
  id: string;
  tenantId: string;
  accountId: string;
  contactId?: string | null;
  dealId?: string | null;
  quoteId?: string | null;
  ownerId: string;
  orderNumber: string;
  name: string;
  status: string;
  currency: string;
  total: string;
  orderedAt?: string | null;
  expectedFulfillmentAt?: string | null;
  lineItems?: Array<Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
};

type DevRFQ = Record<string, unknown> & {
  id: string;
  tenantId: string;
  dealId: string;
  accountId: string;
  contactId?: string | null;
  ownerId: string;
  rfqNumber: string;
  title: string;
  name: string;
  status: string;
  currency: string;
  convertedQuoteId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DevValidationRule = {
  id: string;
  objectType: string;
  field: string;
  label: string;
  ruleType: 'required';
  enabled: boolean;
  message: string;
  configurable: boolean;
  updatedAt: string;
};

export type DevValidationField = {
  objectType: string;
  field: string;
  label: string;
  dataType: 'text' | 'number' | 'date' | 'boolean' | 'relation' | 'array' | 'money';
  group: string;
  system: boolean;
  defaultMessage: string;
};

type DevPreviewState = {
  roles: DevRole[];
  users: DevUser[];
  profile: DevProfile;
  scoringRules: ScoringRule[];
  quoteAutomationRules: QuoteAutomationRule[];
  pipelines: DevPipeline[];
  products: DevProduct[];
  productKits: DevProductKit[];
  vendors: DevVendor[];
  currencies: DevCurrency[];
  taxZones: DevTaxZone[];
  taxRates: DevTaxRate[];
  accounts: DevAccount[];
  deals: DevDeal[];
  contacts: DevContact[];
  leads: DevLead[];
  activities: DevActivity[];
  quotes: DevQuote[];
  discountRequests: DevDiscountRequest[];
  quoteRevisions: DevQuoteRevision[];
  quoteTemplates: DevQuoteTemplate[];
  quoteDocuments: DevQuoteDocument[];
  quoteESignEnvelopes: DevQuoteESignEnvelope[];
  orders: DevOrder[];
  rfqs: DevRFQ[];
  validationRules: DevValidationRule[];
};

declare global {
  // eslint-disable-next-line no-var
  var __nexusDevPreviewState: DevPreviewState | undefined;
}

const now = new Date().toISOString();
const dayMs = 24 * 60 * 60 * 1000;

const VALIDATION_FIELD_CATALOG: DevValidationField[] = [
  // Contacts
  { objectType: 'contact', field: 'accountId', label: 'Account', dataType: 'relation', group: 'Relationships', system: true, defaultMessage: 'Contact must be linked to an account before it can be created.' },
  { objectType: 'contact', field: 'ownerId', label: 'Owner', dataType: 'relation', group: 'Ownership', system: true, defaultMessage: 'Every contact must have an owner for routing and auditability.' },
  { objectType: 'contact', field: 'firstName', label: 'First name', dataType: 'text', group: 'Identity', system: true, defaultMessage: 'First name is required.' },
  { objectType: 'contact', field: 'lastName', label: 'Last name', dataType: 'text', group: 'Identity', system: true, defaultMessage: 'Last name is required.' },
  { objectType: 'contact', field: 'email', label: 'Email', dataType: 'text', group: 'Communication', system: true, defaultMessage: 'Email is required by contact policy.' },
  { objectType: 'contact', field: 'phone', label: 'Primary phone', dataType: 'text', group: 'Communication', system: true, defaultMessage: 'Primary phone is required by contact policy.' },
  { objectType: 'contact', field: 'mobile', label: 'Mobile', dataType: 'text', group: 'Communication', system: true, defaultMessage: 'Mobile number is required.' },
  { objectType: 'contact', field: 'whatsapp', label: 'WhatsApp', dataType: 'text', group: 'Communication', system: false, defaultMessage: 'WhatsApp number is required.' },
  { objectType: 'contact', field: 'jobTitle', label: 'Job title', dataType: 'text', group: 'Profile', system: true, defaultMessage: 'Job title is required.' },
  { objectType: 'contact', field: 'department', label: 'Department', dataType: 'text', group: 'Profile', system: true, defaultMessage: 'Department is required.' },
  { objectType: 'contact', field: 'photoUrl', label: 'Profile photo', dataType: 'text', group: 'Profile', system: false, defaultMessage: 'Profile photo is required.' },
  { objectType: 'contact', field: 'country', label: 'Country', dataType: 'text', group: 'Address', system: true, defaultMessage: 'Country is required.' },
  { objectType: 'contact', field: 'city', label: 'City', dataType: 'text', group: 'Address', system: true, defaultMessage: 'City is required.' },
  { objectType: 'contact', field: 'address', label: 'Address', dataType: 'text', group: 'Address', system: true, defaultMessage: 'Address is required.' },
  { objectType: 'contact', field: 'gdprConsent', label: 'Consent', dataType: 'boolean', group: 'Privacy', system: true, defaultMessage: 'Consent must be captured before outreach.' },

  // Accounts
  { objectType: 'account', field: 'name', label: 'Account name', dataType: 'text', group: 'Identity', system: true, defaultMessage: 'Account name is required.' },
  { objectType: 'account', field: 'ownerId', label: 'Owner', dataType: 'relation', group: 'Ownership', system: true, defaultMessage: 'Account owner is required for routing and accountability.' },
  { objectType: 'account', field: 'industry', label: 'Industry', dataType: 'text', group: 'Profile', system: true, defaultMessage: 'Industry is required by account policy.' },
  { objectType: 'account', field: 'type', label: 'Account type', dataType: 'text', group: 'Profile', system: true, defaultMessage: 'Account type is required.' },
  { objectType: 'account', field: 'tier', label: 'Tier', dataType: 'text', group: 'Profile', system: true, defaultMessage: 'Account tier is required.' },
  { objectType: 'account', field: 'website', label: 'Website', dataType: 'text', group: 'Profile', system: true, defaultMessage: 'Website is required.' },
  { objectType: 'account', field: 'phone', label: 'Phone', dataType: 'text', group: 'Communication', system: true, defaultMessage: 'Account phone is required.' },
  { objectType: 'account', field: 'email', label: 'Email', dataType: 'text', group: 'Communication', system: true, defaultMessage: 'Account email is required.' },
  { objectType: 'account', field: 'billingCountry', label: 'Billing country', dataType: 'text', group: 'Billing address', system: true, defaultMessage: 'Billing country is required for account governance.' },
  { objectType: 'account', field: 'billingCity', label: 'Billing city', dataType: 'text', group: 'Billing address', system: true, defaultMessage: 'Billing city is required.' },
  { objectType: 'account', field: 'billingAddress', label: 'Billing address', dataType: 'text', group: 'Billing address', system: true, defaultMessage: 'Billing address is required.' },
  { objectType: 'account', field: 'shippingCountry', label: 'Shipping country', dataType: 'text', group: 'Shipping address', system: true, defaultMessage: 'Shipping country is required.' },
  { objectType: 'account', field: 'shippingCity', label: 'Shipping city', dataType: 'text', group: 'Shipping address', system: true, defaultMessage: 'Shipping city is required.' },
  { objectType: 'account', field: 'shippingAddress', label: 'Shipping address', dataType: 'text', group: 'Shipping address', system: true, defaultMessage: 'Shipping address is required.' },
  { objectType: 'account', field: 'taxId', label: 'Tax ID', dataType: 'text', group: 'Compliance', system: false, defaultMessage: 'Tax ID is required for regulated accounts.' },

  // Leads
  { objectType: 'lead', field: 'firstName', label: 'First name', dataType: 'text', group: 'Identity', system: true, defaultMessage: 'Lead first name is required.' },
  { objectType: 'lead', field: 'lastName', label: 'Last name', dataType: 'text', group: 'Identity', system: true, defaultMessage: 'Lead last name is required.' },
  { objectType: 'lead', field: 'company', label: 'Company', dataType: 'text', group: 'Company', system: true, defaultMessage: 'Company is required by lead policy.' },
  { objectType: 'lead', field: 'source', label: 'Source', dataType: 'text', group: 'Attribution', system: true, defaultMessage: 'Lead source is required for attribution.' },
  { objectType: 'lead', field: 'ownerId', label: 'Owner', dataType: 'relation', group: 'Ownership', system: true, defaultMessage: 'Lead owner is required for assignment.' },
  { objectType: 'lead', field: 'email', label: 'Email', dataType: 'text', group: 'Communication', system: true, defaultMessage: 'Lead email is required.' },
  { objectType: 'lead', field: 'phone', label: 'Phone', dataType: 'text', group: 'Communication', system: true, defaultMessage: 'Lead phone is required.' },
  { objectType: 'lead', field: 'rating', label: 'Rating', dataType: 'text', group: 'Qualification', system: true, defaultMessage: 'Lead rating is required.' },
  { objectType: 'lead', field: 'status', label: 'Status', dataType: 'text', group: 'Qualification', system: true, defaultMessage: 'Lead status is required.' },

  // Deals
  { objectType: 'deal', field: 'name', label: 'Deal name', dataType: 'text', group: 'Identity', system: true, defaultMessage: 'Deal name is required.' },
  { objectType: 'deal', field: 'accountId', label: 'Account', dataType: 'relation', group: 'Relationships', system: true, defaultMessage: 'Deal must be linked to an account.' },
  { objectType: 'deal', field: 'ownerId', label: 'Owner', dataType: 'relation', group: 'Ownership', system: true, defaultMessage: 'Deal owner is required.' },
  { objectType: 'deal', field: 'pipelineId', label: 'Pipeline', dataType: 'relation', group: 'Pipeline', system: true, defaultMessage: 'Pipeline is required.' },
  { objectType: 'deal', field: 'stageId', label: 'Stage', dataType: 'relation', group: 'Pipeline', system: true, defaultMessage: 'Stage is required.' },
  { objectType: 'deal', field: 'amount', label: 'Amount', dataType: 'money', group: 'Commercial', system: true, defaultMessage: 'Deal amount is required.' },
  { objectType: 'deal', field: 'currency', label: 'Currency', dataType: 'text', group: 'Commercial', system: true, defaultMessage: 'Deal currency is required.' },
  { objectType: 'deal', field: 'expectedCloseDate', label: 'Expected close date', dataType: 'date', group: 'Forecast', system: true, defaultMessage: 'Expected close date is required.' },
  { objectType: 'deal', field: 'forecastCategory', label: 'Forecast category', dataType: 'text', group: 'Forecast', system: true, defaultMessage: 'Forecast category is required.' },

  // Products
  { objectType: 'product', field: 'name', label: 'Product name', dataType: 'text', group: 'Catalog', system: true, defaultMessage: 'Product name is required.' },
  { objectType: 'product', field: 'sku', label: 'SKU', dataType: 'text', group: 'Catalog', system: true, defaultMessage: 'SKU is required.' },
  { objectType: 'product', field: 'category', label: 'Category', dataType: 'text', group: 'Catalog', system: true, defaultMessage: 'Product category is required.' },
  { objectType: 'product', field: 'currency', label: 'Currency', dataType: 'text', group: 'Pricing', system: true, defaultMessage: 'Currency is required.' },
  { objectType: 'product', field: 'basePrice', label: 'Base price', dataType: 'money', group: 'Pricing', system: true, defaultMessage: 'Base price is required.' },
  { objectType: 'product', field: 'taxCode', label: 'Tax code', dataType: 'text', group: 'Compliance', system: true, defaultMessage: 'Tax code is required.' },

  // Quotes
  { objectType: 'quote', field: 'accountId', label: 'Account', dataType: 'relation', group: 'Relationships', system: true, defaultMessage: 'Quote must be linked to an account.' },
  { objectType: 'quote', field: 'dealId', label: 'Deal', dataType: 'relation', group: 'Relationships', system: true, defaultMessage: 'Quote must be linked to a deal.' },
  { objectType: 'quote', field: 'templateId', label: 'Template', dataType: 'relation', group: 'Document', system: true, defaultMessage: 'Quote template is required.' },
  { objectType: 'quote', field: 'currency', label: 'Currency', dataType: 'text', group: 'Commercial', system: true, defaultMessage: 'Quote currency is required.' },
  { objectType: 'quote', field: 'validUntil', label: 'Valid until', dataType: 'date', group: 'Commercial', system: true, defaultMessage: 'Quote expiry date is required.' },
  { objectType: 'quote', field: 'approverId', label: 'Approver', dataType: 'relation', group: 'Approval', system: true, defaultMessage: 'Approver is required for quote governance.' },
  { objectType: 'quote', field: 'paymentTerms', label: 'Payment terms', dataType: 'text', group: 'Commercial', system: true, defaultMessage: 'Payment terms are required.' },

  // Activities
  { objectType: 'activity', field: 'subject', label: 'Subject', dataType: 'text', group: 'Identity', system: true, defaultMessage: 'Activity subject is required.' },
  { objectType: 'activity', field: 'type', label: 'Type', dataType: 'text', group: 'Identity', system: true, defaultMessage: 'Activity type is required.' },
  { objectType: 'activity', field: 'ownerId', label: 'Owner', dataType: 'relation', group: 'Ownership', system: true, defaultMessage: 'Activity owner is required.' },
  { objectType: 'activity', field: 'dueDate', label: 'Due date', dataType: 'date', group: 'Schedule', system: true, defaultMessage: 'Activity due date is required.' },
  { objectType: 'activity', field: 'accountId', label: 'Account', dataType: 'relation', group: 'Relationships', system: true, defaultMessage: 'Activity account link is required.' },
  { objectType: 'activity', field: 'contactId', label: 'Contact', dataType: 'relation', group: 'Relationships', system: true, defaultMessage: 'Activity contact link is required.' },
  { objectType: 'activity', field: 'outcome', label: 'Outcome', dataType: 'text', group: 'Completion', system: true, defaultMessage: 'Activity outcome is required.' },
];

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * dayMs).toISOString();
}

function isoDaysFromNow(days: number) {
  return new Date(Date.now() + days * dayMs).toISOString();
}

function createInitialState(): DevPreviewState {
  const roles: DevRole[] = [
    {
      id: 'role-admin',
      name: 'Administrator',
      description: 'Full workspace administration and CRM control.',
      permissions: ['*'],
      isSystem: true,
    },
    {
      id: 'role-sales-manager',
      name: 'Sales Manager',
      description: 'Pipeline, forecasting, quote, and reporting management.',
      permissions: ['leads:*', 'deals:*', 'quotes:*', 'reports:*', 'accounts:*'],
      isSystem: true,
    },
    {
      id: 'role-sales-rep',
      name: 'Sales Rep',
      description: 'Day-to-day lead, deal, account, and activity execution.',
      permissions: [
        'leads:read',
        'leads:update',
        'deals:read',
        'deals:update',
        'accounts:read',
        'contacts:read',
        'quotes:read',
      ],
      isSystem: true,
    },
  ];

  const users: DevUser[] = [
    {
      id: 'dev-admin',
      firstName: 'Dev',
      lastName: 'Admin',
      email: 'dev.admin@nexus.local',
      isActive: true,
      roles: [{ id: roles[0].id, name: roles[0].name }],
      phone: '+1 555 0100',
      timezone: 'Africa/Cairo',
      language: 'en',
      lastLoginAt: now,
    },
    {
      id: 'sara-manager',
      firstName: 'Sara',
      lastName: 'Manager',
      email: 'sara.manager@nexus.local',
      isActive: true,
      roles: [{ id: roles[1].id, name: roles[1].name }],
      timezone: 'Africa/Cairo',
      language: 'en',
      lastLoginAt: now,
    },
  ];

  const profile: DevProfile = {
    ...users[0],
    locale: 'en',
    avatarUrl: null,
    profile: {
      jobTitle: 'CRM Administrator',
      department: 'Revenue Operations',
      bio: 'Development preview user for local Nexus CRM work.',
      skills: ['CRM Operations', 'Workflow Design', 'Reporting'],
      notificationPrefs: {
        email: true,
        inApp: true,
      },
      dashboardLayout: {},
    },
    userRoles: [{ role: { id: roles[0].id, name: roles[0].name } }],
  };

  return {
    roles,
    users,
    profile,
    scoringRules: [
      {
        id: 'score-meeting-booked',
        name: 'Meeting booked',
        signal: 'meeting_booked',
        points: 25,
        isActive: true,
      },
      {
        id: 'score-demo-requested',
        name: 'Demo requested',
        signal: 'demo_requested',
        points: 35,
        isActive: true,
      },
      {
        id: 'score-recency-decay',
        name: 'Inactive lead decay',
        signal: 'recency_decay',
        points: -10,
        isActive: true,
      },
    ],
    quoteAutomationRules: [
      {
        id: 'quote-high-intent',
        name: 'Create quote at proposal stage',
        trigger: 'deal_stage_changed',
        isActive: true,
        conditions: { stage: 'Proposal' },
        actions: [{ type: 'create_quote', assignTo: 'deal_owner' }],
      },
    ],
    pipelines: [
      {
        id: 'pipeline-enterprise',
        name: 'Enterprise Sales',
        currency: 'USD',
        isDefault: true,
        isActive: true,
        stages: [
          { id: 'stage-new', name: 'New', order: 1, probability: 10, rottenDays: 14, color: '#64748b' },
          { id: 'stage-qualified', name: 'Qualified', order: 2, probability: 30, rottenDays: 21, color: '#2563eb' },
          { id: 'stage-proposal', name: 'Proposal', order: 3, probability: 55, rottenDays: 21, color: '#7c3aed' },
          { id: 'stage-negotiation', name: 'Negotiation', order: 4, probability: 75, rottenDays: 14, color: '#f59e0b' },
          { id: 'stage-won', name: 'Closed Won', order: 5, probability: 100, rottenDays: 0, color: '#10b981' },
        ],
      },
      {
        id: 'pipeline-smb',
        name: 'SMB Sales',
        currency: 'USD',
        isDefault: false,
        isActive: true,
        stages: [
          { id: 'stage-smb-new', name: 'New', order: 1, probability: 15, rottenDays: 7, color: '#64748b' },
          { id: 'stage-smb-demo', name: 'Demo', order: 2, probability: 45, rottenDays: 10, color: '#06b6d4' },
          { id: 'stage-smb-close', name: 'Close', order: 3, probability: 80, rottenDays: 7, color: '#f97316' },
        ],
      },
    ],
    products: [
      {
        id: 'prod-crm-enterprise',
        name: 'Nexus CRM Enterprise',
        nameAr: null,
        sku: 'NX-CRM-ENT',
        currency: 'USD',
        listPrice: 48000,
        isActive: true,
        type: 'SERVICE',
        billingType: 'ONE_TIME',
        taxable: true,
      },
      {
        id: 'prod-implementation',
        name: 'Implementation Accelerator',
        sku: 'NX-IMP-ACC',
        currency: 'USD',
        listPrice: 12500,
        isActive: true,
        type: 'SERVICE',
        billingType: 'ONE_TIME',
        taxable: true,
      },
      {
        id: 'prod-support',
        name: 'Premium Support Pack',
        sku: 'NX-SUP-PREM',
        currency: 'USD',
        listPrice: 7200,
        isActive: true,
        type: 'SERVICE',
        billingType: 'ONE_TIME',
        taxable: true,
      },
    ],
    productKits: [
      {
        id: 'kit-enterprise-launch',
        name: 'Enterprise Launch Kit',
        sku: 'KIT-ENT-LAUNCH',
        currency: 'USD',
        listPrice: 67500,
        items: [
          { productId: 'prod-crm-enterprise', quantity: 1 },
          { productId: 'prod-implementation', quantity: 1 },
          { productId: 'prod-support', quantity: 1 },
        ],
      },
    ],
    vendors: [
      {
        id: 'vendor-nexus',
        name: 'Nexus Direct',
        code: 'NX-DIRECT',
        currency: 'USD',
        isActive: true,
        products: ['prod-crm-enterprise', 'prod-implementation', 'prod-support'],
      },
      {
        id: 'vendor-partner',
        name: 'Regional Implementation Partner',
        code: 'REG-PARTNER',
        currency: 'USD',
        isActive: true,
        products: ['prod-implementation'],
      },
    ],
    currencies: [
      { id: 'cur-usd', code: 'USD', name: 'US Dollar', symbol: '$', isBase: true, isActive: true, decimalPlaces: 2 },
      { id: 'cur-egp', code: 'EGP', name: 'Egyptian Pound', symbol: 'EGP', isBase: false, isActive: true, decimalPlaces: 2 },
      { id: 'cur-sar', code: 'SAR', name: 'Saudi Riyal', symbol: 'SAR', isBase: false, isActive: true, decimalPlaces: 2 },
      { id: 'cur-aed', code: 'AED', name: 'UAE Dirham', symbol: 'AED', isBase: false, isActive: true, decimalPlaces: 2 },
    ],
    taxZones: [
      { id: 'tax-zone-us', name: 'United States Sales Tax', country: 'US' },
      { id: 'tax-zone-ksa', name: 'KSA VAT', country: 'SA' },
      { id: 'tax-zone-uae', name: 'UAE VAT', country: 'AE' },
    ],
    taxRates: [
      { id: 'tax-rate-us-standard', zoneId: 'tax-zone-us', name: 'Standard Sales Tax', code: 'US_STANDARD', rate: 8.25 },
      { id: 'tax-rate-ksa-vat', zoneId: 'tax-zone-ksa', name: 'Standard VAT', code: 'KSA_VAT_STANDARD', rate: 15 },
      { id: 'tax-rate-uae-vat', zoneId: 'tax-zone-uae', name: 'Standard VAT', code: 'UAE_VAT_STANDARD', rate: 5 },
    ],
    accounts: createPreviewAccounts(),
    deals: createPreviewDeals(),
    contacts: createPreviewContacts(),
    leads: createPreviewLeads(),
    activities: createPreviewActivities(),
    quotes: createPreviewQuotes(),
    discountRequests: createPreviewDiscountRequests(),
    quoteRevisions: createPreviewQuoteRevisions(),
    quoteTemplates: createPreviewQuoteTemplates(),
    quoteDocuments: createPreviewQuoteDocuments(),
    quoteESignEnvelopes: createPreviewQuoteESignEnvelopes(),
    orders: createPreviewOrders(),
    rfqs: createPreviewRFQs(),
    validationRules: createPreviewValidationRules(),
  };
}

function createPreviewLeads(): DevLead[] {
  const base = {
    tenantId: 'default',
    code: '',
    phone: null,
    aiScore: null,
    convertedAt: null,
    convertedToContactId: null,
    convertedToAccountId: null,
    convertedToDealId: null,
    disqualifiedReason: null,
    customFields: {},
  };

  return [
    {
      ...base,
      code: 'LED-2026-000001',
      id: 'lead-cairo-retail',
      ownerId: 'sara-manager',
      firstName: 'Mariam',
      lastName: 'Youssef',
      email: 'mariam.youssef@cairoretail.example',
      company: 'Cairo Retail Group',
      jobTitle: 'Head of Customer Experience',
      status: 'QUALIFIED',
      source: 'EVENT',
      score: 91,
      tags: ['retail', 'egypt', 'cpq'],
      createdAt: isoDaysAgo(3),
      updatedAt: isoDaysAgo(1),
    },
    {
      ...base,
      code: 'LED-2026-000002',
      id: 'lead-zenith-manufacturing',
      ownerId: 'sara-manager',
      firstName: 'Nadine',
      lastName: 'Karam',
      email: 'nadine.karam@zenithmfg.example',
      company: 'Zenith Manufacturing',
      jobTitle: 'Chief Revenue Officer',
      status: 'NEW',
      source: 'WEBSITE',
      score: 86,
      tags: ['manufacturing', 'mea'],
      createdAt: isoDaysAgo(5),
      updatedAt: isoDaysAgo(2),
    },
    {
      ...base,
      code: 'LED-2026-000003',
      id: 'lead-atlas-energy',
      ownerId: 'dev-admin',
      firstName: 'Omar',
      lastName: 'Hassan',
      email: 'omar.hassan@atlasenergy.example',
      phone: '+20 100 555 0142',
      company: 'Atlas Energy',
      jobTitle: 'VP Commercial Operations',
      status: 'WORKING',
      source: 'REFERRAL',
      score: 72,
      tags: ['energy', 'referral'],
      createdAt: isoDaysAgo(9),
      updatedAt: isoDaysAgo(1),
    },
    {
      ...base,
      code: 'LED-2026-000004',
      id: 'lead-orbit-logistics',
      ownerId: 'dev-admin',
      firstName: 'Rami',
      lastName: 'Fahmy',
      email: 'rami.fahmy@orbitlogistics.example',
      company: 'Orbit Logistics',
      jobTitle: 'Operations Director',
      status: 'ASSIGNED',
      source: 'OUTBOUND',
      score: 55,
      tags: ['logistics', 'outbound'],
      createdAt: isoDaysAgo(14),
      updatedAt: isoDaysAgo(6),
    },
    {
      ...base,
      code: 'LED-2026-000005',
      id: 'lead-palm-health',
      ownerId: 'sara-manager',
      firstName: 'Layla',
      lastName: 'Mansour',
      email: 'layla.mansour@palmhealth.example',
      company: 'Palm Health Clinics',
      jobTitle: 'Procurement Lead',
      status: 'UNQUALIFIED',
      source: 'OTHER',
      score: 28,
      disqualifiedReason: 'No active budget this quarter.',
      tags: ['healthcare'],
      createdAt: isoDaysAgo(21),
      updatedAt: isoDaysAgo(8),
    },
  ];
}

function createPreviewAccounts(): DevAccount[] {
  const base = {
    tenantId: 'default',
    ownerId: 'sara-manager',
    legalName: null,
    tradeName: null,
    website: null,
    phone: null,
    fax: null,
    email: null,
    industry: null,
    subIndustry: null,
    lifecycleStage: null,
    annualRevenue: null,
    employeeCount: null,
    foundedYear: null,
    country: null,
    city: null,
    address: null,
    zipCode: null,
    linkedInUrl: null,
    description: null,
    sicCode: null,
    naicsCode: null,
    taxId: null,
    vatNumber: null,
    commercialRegistrationNumber: null,
    paymentTerms: null,
    creditLimit: null,
    currency: 'USD',
    priceBookId: null,
    territoryId: null,
    healthScore: null,
    npsScore: null,
    riskLevel: null,
    lastActivityAt: null,
    billingAddressLine1: null,
    billingAddressLine2: null,
    billingCity: null,
    billingState: null,
    billingPostalCode: null,
    billingCountry: null,
    billingLatitude: null,
    billingLongitude: null,
    shippingAddressLine1: null,
    shippingAddressLine2: null,
    shippingCity: null,
    shippingState: null,
    shippingPostalCode: null,
    shippingCountry: null,
    shippingLatitude: null,
    shippingLongitude: null,
    shippingInstructions: null,
    sameAsBilling: null,
    customFields: {},
    tags: [] as string[],
    createdAt: isoDaysAgo(120),
    updatedAt: isoDaysAgo(1),
  };

  return [
    {
      ...base,
      id: 'acct-helio',
      code: 'ACC-2026-000001',
      name: 'Helio Global',
      type: 'CUSTOMER' as const,
      tier: 'ENTERPRISE' as const,
      status: 'ACTIVE' as const,
      industry: 'Manufacturing',
      country: 'AE',
      city: 'Dubai',
      website: 'https://helio.global',
      email: 'info@helio.global',
      annualRevenue: '45000000',
      employeeCount: 850,
    },
    {
      ...base,
      id: 'acct-aurora',
      code: 'ACC-2026-000002',
      name: 'Aurora Bank',
      type: 'CUSTOMER' as const,
      tier: 'ENTERPRISE' as const,
      status: 'ACTIVE' as const,
      industry: 'Financial Services',
      country: 'EG',
      city: 'Cairo',
      website: 'https://aurorabank.com',
      annualRevenue: '120000000',
      employeeCount: 3200,
    },
    {
      ...base,
      id: 'acct-nova',
      code: 'ACC-2026-000003',
      name: 'Nova Retail Group',
      legalName: 'Nova Retail Group S.A.E.',
      tradeName: 'Nova Retail',
      type: 'PROSPECT' as const,
      tier: 'MID_MARKET' as const,
      status: 'ACTIVE' as const,
      industry: 'Retail',
      subIndustry: 'Omnichannel Commerce',
      lifecycleStage: 'Expansion discovery',
      country: 'EG',
      city: 'Cairo',
      address: '90 Road, New Cairo',
      zipCode: '11835',
      website: 'https://novaretail.com',
      email: 'procurement@novaretail.com',
      phone: '+20 2 2750 4400',
      fax: '+20 2 2750 4401',
      linkedInUrl: 'https://linkedin.com/company/nova-retail',
      annualRevenue: '8500000',
      employeeCount: 340,
      foundedYear: 2016,
      sicCode: '5311',
      naicsCode: '455110',
      taxId: 'EG-TAX-928441',
      vatNumber: 'EG-VAT-117204',
      commercialRegistrationNumber: 'CR-CAI-448210',
      paymentTerms: 'Net 30 after milestone acceptance',
      creditLimit: '125000',
      currency: 'USD',
      priceBookId: 'pb-mena-midmarket',
      territoryId: 'territory-eg-cairo',
      healthScore: 78,
      npsScore: 42,
      riskLevel: 'MEDIUM',
      lastActivityAt: isoDaysAgo(1),
      billingAddressLine1: 'Nova Retail HQ, Finance Department',
      billingAddressLine2: 'Tower B, 8th Floor',
      billingCity: 'Cairo',
      billingState: 'Cairo Governorate',
      billingPostalCode: '11835',
      billingCountry: 'EG',
      billingLatitude: 30.0212,
      billingLongitude: 31.4955,
      shippingAddressLine1: 'Nova Retail Distribution Center',
      shippingAddressLine2: 'Warehouse 4, Ring Road',
      shippingCity: 'Cairo',
      shippingState: 'Cairo Governorate',
      shippingPostalCode: '11828',
      shippingCountry: 'EG',
      shippingLatitude: 30.0501,
      shippingLongitude: 31.3517,
      shippingInstructions: 'Deliver implementation hardware packs Sunday-Thursday, 9am-4pm.',
      sameAsBilling: false,
      customFields: {
        accountManager: 'Sara Manager',
        buyingCenter: 'Customer Experience and Procurement',
        onboardingPhase: 'CPQ blueprint',
        complianceProfile: 'VAT registered, local data residency required',
      },
      tags: ['retail', 'egypt', 'cpq', 'customer-360'],
    },
    {
      ...base,
      id: 'acct-meridian',
      code: 'ACC-2026-000004',
      name: 'Meridian Logistics',
      type: 'PROSPECT' as const,
      tier: 'SMB' as const,
      status: 'AT_RISK' as const,
      industry: 'Logistics',
      country: 'JO',
      city: 'Amman',
      annualRevenue: '2100000',
      employeeCount: 95,
    },
    {
      ...base,
      id: 'acct-pulse',
      code: 'ACC-2026-000005',
      name: 'Pulse Health',
      type: 'PROSPECT' as const,
      tier: 'SMB' as const,
      status: 'ACTIVE' as const,
      industry: 'Healthcare',
      country: 'SA',
      city: 'Riyadh',
      annualRevenue: '3200000',
      employeeCount: 120,
    },
  ];
}

function createPreviewDeals(): DevDeal[] {
  const base = {
    tenantId: 'default',
    code: '',
    currency: 'USD',
    lostReason: null,
    lostDetail: null,
    closeReason: null,
    dataQualityScore: 90,
    forecastCategory: 'PIPELINE',
    meddicicData: {},
    aiWinProbability: null,
    aiInsights: null,
    source: 'Preview data',
    campaignId: null,
    version: 1,
  };

  return [
    {
      ...base,
      code: 'OPP-2026-000001',
      id: 'deal-helio-enterprise',
      ownerId: 'sara-manager',
      accountId: 'acct-helio',
      pipelineId: 'pipeline-enterprise',
      stageId: 'stage-negotiation',
      stage: { id: 'stage-negotiation', name: 'Negotiation' },
      name: 'Helio Global CRM Transformation',
      accountName: 'Helio Global',
      amount: '185000',
      probability: 75,
      expectedCloseDate: isoDaysFromNow(18),
      actualCloseDate: null,
      status: 'OPEN',
      forecastCategory: 'COMMIT',
      meddicicScore: 88,
      competitors: ['Salesforce', 'HubSpot'],
      customFields: { region: 'MEA', vertical: 'Manufacturing' },
      tags: ['MEA', 'Manufacturing'],
      createdAt: isoDaysAgo(54),
      updatedAt: isoDaysAgo(1),
    },
    {
      ...base,
      code: 'OPP-2026-000002',
      id: 'deal-aurora-rollout',
      ownerId: 'dev-admin',
      accountId: 'acct-aurora',
      pipelineId: 'pipeline-enterprise',
      stageId: 'stage-won',
      stage: { id: 'stage-won', name: 'Closed Won' },
      name: 'Aurora Bank Revenue Workspace',
      accountName: 'Aurora Bank',
      amount: '132000',
      probability: 100,
      expectedCloseDate: isoDaysAgo(8),
      actualCloseDate: isoDaysAgo(7),
      status: 'WON',
      closeReason: 'Executive sponsor aligned',
      forecastCategory: 'CLOSED',
      meddicicScore: 91,
      competitors: ['Zoho CRM'],
      customFields: { region: 'GCC', vertical: 'Financial Services' },
      tags: ['GCC', 'Finance'],
      createdAt: isoDaysAgo(88),
      updatedAt: isoDaysAgo(7),
    },
    {
      ...base,
      code: 'OPP-2026-000003',
      id: 'deal-nova-proposal',
      ownerId: 'sara-manager',
      accountId: 'acct-nova',
      pipelineId: 'pipeline-enterprise',
      stageId: 'stage-proposal',
      stage: { id: 'stage-proposal', name: 'Proposal' },
      name: 'Nova Retail Omnichannel CRM',
      accountName: 'Nova Retail Group',
      amount: '76000',
      probability: 55,
      expectedCloseDate: isoDaysFromNow(33),
      actualCloseDate: null,
      status: 'OPEN',
      forecastCategory: 'BEST_CASE',
      meddicicScore: 73,
      competitors: ['Pipedrive'],
      customFields: { region: 'Egypt', vertical: 'Retail' },
      tags: ['Egypt', 'Retail'],
      createdAt: isoDaysAgo(31),
      updatedAt: isoDaysAgo(2),
    },
    {
      ...base,
      code: 'OPP-2026-000004',
      id: 'deal-meridian-lost',
      ownerId: 'dev-admin',
      accountId: 'acct-meridian',
      pipelineId: 'pipeline-enterprise',
      stageId: 'stage-proposal',
      stage: { id: 'stage-proposal', name: 'Proposal' },
      name: 'Meridian Logistics Renewal',
      accountName: 'Meridian Logistics',
      amount: '54000',
      probability: 0,
      expectedCloseDate: isoDaysAgo(12),
      actualCloseDate: isoDaysAgo(10),
      status: 'LOST',
      lostReason: 'PRICE',
      lostDetail: 'Chose a lower-cost regional implementation.',
      closeReason: 'Budget compression',
      forecastCategory: 'OMITTED',
      meddicicScore: 64,
      competitors: ['Zoho CRM'],
      customFields: { region: 'Levant', vertical: 'Logistics' },
      tags: ['Levant', 'Logistics'],
      createdAt: isoDaysAgo(69),
      updatedAt: isoDaysAgo(10),
    },
    {
      ...base,
      code: 'OPP-2026-000005',
      id: 'deal-pulse-smb',
      ownerId: 'sara-manager',
      accountId: 'acct-pulse',
      pipelineId: 'pipeline-smb',
      stageId: 'stage-smb-demo',
      stage: { id: 'stage-smb-demo', name: 'Demo' },
      name: 'Pulse Health SMB CRM',
      accountName: 'Pulse Health',
      amount: '24000',
      probability: 45,
      expectedCloseDate: isoDaysFromNow(14),
      actualCloseDate: null,
      status: 'OPEN',
      meddicicScore: 62,
      competitors: ['HubSpot'],
      customFields: { region: 'KSA', vertical: 'Healthcare' },
      tags: ['KSA', 'Healthcare'],
      createdAt: isoDaysAgo(16),
      updatedAt: isoDaysAgo(1),
    },
  ];
}

function createPreviewContacts(): DevContact[] {
  const base = {
    tenantId: 'default',
    code: '',
    phone: null,
    mobile: null,
    linkedInUrl: null,
    twitterHandle: null,
    address: null,
    preferredChannel: 'email',
    doNotEmail: false,
    doNotCall: false,
    gdprConsent: true,
    gdprConsentAt: isoDaysAgo(40),
    customFields: {
      photoUrl: '',
      whatsapp: '',
      secondPhone: '',
      lifecycleStage: 'Decision maker',
      socialProfiles: [],
      productTags: [],
      industryTags: [],
      documents: [],
      emailThreads: [],
      auditTrail: [],
    },
    tags: [],
    isActive: true,
  };

  return [
    {
      ...base,
      code: 'CON-2026-000001',
      id: 'contact-lina-helio',
      ownerId: 'sara-manager',
      accountId: 'acct-helio',
      firstName: 'Lina',
      lastName: 'Haddad',
      email: 'lina.haddad@helio.example',
      jobTitle: 'Chief Revenue Officer',
      department: 'Revenue',
      country: 'AE',
      city: 'Dubai',
      timezone: 'Asia/Dubai',
      linkedInUrl: 'https://linkedin.com/in/lina-haddad',
      customFields: {
        ...base.customFields,
        whatsapp: '+971 50 555 0110',
        secondPhone: '+971 4 555 0199',
        lifecycleStage: 'Executive sponsor',
        productTags: ['Enterprise CRM', 'CPQ'],
        industryTags: ['Energy', 'Industrial'],
        documents: [
          { id: 'doc-lina-nda', name: 'Signed NDA.pdf', type: 'Legal', updatedAt: isoDaysAgo(12) },
          { id: 'doc-lina-brief', name: 'Executive Brief.docx', type: 'Briefing', updatedAt: isoDaysAgo(3) },
        ],
        emailThreads: [
          { id: 'mail-lina-1', subject: 'Commercial approval path', from: 'lina.haddad@helio.example', lastMessageAt: isoDaysAgo(1), count: 6 },
          { id: 'mail-lina-2', subject: 'CPQ template review', from: 'sara.manager@nexus.local', lastMessageAt: isoDaysAgo(4), count: 3 },
        ],
        auditTrail: [
          { id: 'audit-lina-1', action: 'Account link verified', actor: 'System', at: isoDaysAgo(1) },
          { id: 'audit-lina-2', action: 'Consent refreshed', actor: 'Sara Manager', at: isoDaysAgo(8) },
        ],
      },
      tags: ['Executive', 'CPQ', 'Energy'],
      lastContactedAt: isoDaysAgo(1),
      createdAt: isoDaysAgo(80),
      updatedAt: isoDaysAgo(1),
    },
    {
      ...base,
      code: 'CON-2026-000002',
      id: 'contact-omar-aurora',
      ownerId: 'dev-admin',
      accountId: 'acct-aurora',
      firstName: 'Omar',
      lastName: 'Nabil',
      email: 'omar.nabil@aurora.example',
      jobTitle: 'VP Digital Banking',
      department: 'Technology',
      country: 'EG',
      city: 'Cairo',
      timezone: 'Africa/Cairo',
      linkedInUrl: 'https://linkedin.com/in/omar-nabil',
      customFields: {
        ...base.customFields,
        whatsapp: '+20 100 555 0211',
        secondPhone: '+20 2 555 0188',
        lifecycleStage: 'Technical evaluator',
        productTags: ['Customer 360', 'Integration Hub'],
        industryTags: ['Banking', 'Financial Services'],
        emailThreads: [
          { id: 'mail-omar-1', subject: 'Core banking integration notes', from: 'omar.nabil@aurora.example', lastMessageAt: isoDaysAgo(7), count: 9 },
        ],
        documents: [
          { id: 'doc-omar-kickoff', name: 'Kickoff Evidence.zip', type: 'Archive', updatedAt: isoDaysAgo(3) },
        ],
        auditTrail: [
          { id: 'audit-omar-1', action: 'Imported from lead conversion', actor: 'System', at: isoDaysAgo(90) },
        ],
      },
      tags: ['Banking', 'Integration'],
      lastContactedAt: isoDaysAgo(7),
      createdAt: isoDaysAgo(90),
      updatedAt: isoDaysAgo(7),
    },
    {
      ...base,
      code: 'CON-2026-000003',
      id: 'contact-salma-nova',
      ownerId: 'sara-manager',
      accountId: 'acct-nova',
      firstName: 'Salma',
      lastName: 'Farid',
      email: 'salma.farid@nova.example',
      jobTitle: 'Head of Customer Experience',
      department: 'CX',
      country: 'EG',
      city: 'Cairo',
      timezone: 'Africa/Cairo',
      linkedInUrl: 'https://linkedin.com/in/salma-farid',
      customFields: {
        ...base.customFields,
        whatsapp: '+20 111 555 0164',
        secondPhone: '+20 2 555 0155',
        lifecycleStage: 'Business champion',
        productTags: ['Service Desk', 'Customer 360'],
        industryTags: ['Retail', 'Customer Experience'],
        emailThreads: [
          { id: 'mail-salma-1', subject: 'Customer 360 demo follow-up', from: 'salma.farid@nova.example', lastMessageAt: isoDaysAgo(2), count: 4 },
        ],
        documents: [
          { id: 'doc-salma-demo', name: 'Demo Notes.docx', type: 'Meeting Notes', updatedAt: isoDaysAgo(2) },
        ],
        auditTrail: [
          { id: 'audit-salma-1', action: 'Product tags updated', actor: 'Sara Manager', at: isoDaysAgo(2) },
        ],
      },
      tags: ['Retail', 'CX'],
      lastContactedAt: isoDaysAgo(2),
      createdAt: isoDaysAgo(32),
      updatedAt: isoDaysAgo(2),
    },
  ];
}

function createPreviewValidationRules(): DevValidationRule[] {
  const requiredByModule: Record<string, string[]> = {
    contact: ['accountId', 'firstName', 'lastName', 'ownerId'],
    account: ['name', 'ownerId', 'billingCountry'],
    lead: ['firstName', 'lastName', 'source'],
    deal: ['name', 'accountId', 'ownerId', 'pipelineId', 'stageId', 'amount'],
    product: ['name', 'sku', 'currency', 'basePrice'],
    quote: ['accountId', 'dealId', 'templateId', 'currency', 'validUntil'],
    activity: ['subject', 'type', 'ownerId', 'dueDate'],
  };

  return VALIDATION_FIELD_CATALOG.map((field, index) => ({
    id: `${field.objectType}-required-${field.field}`,
    objectType: field.objectType,
    field: field.field,
    label: field.label,
    ruleType: 'required' as const,
    enabled: requiredByModule[field.objectType]?.includes(field.field) ?? false,
    message: field.defaultMessage,
    configurable: true,
    updatedAt: isoDaysAgo(index + 1),
  }));
}

function createPreviewActivities(): DevActivity[] {
  return [
    {
      id: 'act-helio-exec-call',
      code: 'ACT-2026-000001',
      tenantId: 'default',
      ownerId: 'sara-manager',
      type: 'CALL',
      subject: 'Executive negotiation call',
      description: 'Confirm legal path and rollout date.',
      priority: 'HIGH',
      status: 'COMPLETED',
      dueDate: isoDaysAgo(1),
      startDate: isoDaysAgo(1),
      endDate: isoDaysAgo(1),
      completedAt: isoDaysAgo(1),
      duration: 45,
      outcome: 'Commercial terms aligned.',
      dealId: 'deal-helio-enterprise',
      contactId: 'contact-lina-helio',
      leadId: null,
      accountId: 'acct-helio',
      customFields: {},
      version: 1,
      createdAt: isoDaysAgo(2),
      updatedAt: isoDaysAgo(1),
    },
    {
      id: 'act-nova-demo',
      code: 'ACT-2026-000002',
      tenantId: 'default',
      ownerId: 'sara-manager',
      type: 'DEMO',
      subject: 'CPQ and customer 360 demo',
      description: 'Show quote template and account timeline.',
      priority: 'NORMAL',
      status: 'PLANNED',
      dueDate: isoDaysFromNow(2),
      startDate: isoDaysFromNow(2),
      endDate: null,
      completedAt: null,
      duration: 60,
      outcome: null,
      dealId: 'deal-nova-proposal',
      contactId: 'contact-salma-nova',
      leadId: null,
      accountId: 'acct-nova',
      customFields: {},
      version: 1,
      createdAt: isoDaysAgo(1),
      updatedAt: isoDaysAgo(1),
    },
    {
      id: 'act-aurora-email',
      code: 'ACT-2026-000003',
      tenantId: 'default',
      ownerId: 'dev-admin',
      type: 'EMAIL',
      subject: 'Implementation kickoff recap',
      description: null,
      priority: 'NORMAL',
      status: 'COMPLETED',
      dueDate: isoDaysAgo(6),
      startDate: null,
      endDate: null,
      completedAt: isoDaysAgo(6),
      duration: null,
      outcome: 'Kickoff notes sent.',
      dealId: 'deal-aurora-rollout',
      contactId: 'contact-omar-aurora',
      leadId: null,
      accountId: 'acct-aurora',
      customFields: {},
      version: 1,
      createdAt: isoDaysAgo(6),
      updatedAt: isoDaysAgo(6),
    },
    {
      id: 'task-helio-follow-up',
      code: 'TSK-2026-000001',
      tenantId: 'default',
      ownerId: 'dev-admin',
      type: 'TASK',
      subject: 'Follow up with Helio procurement',
      description: 'Client requested final commercial confirmation. Mention the implementation accelerator and payment schedule.',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      dueDate: isoDaysFromNow(1),
      startDate: null,
      endDate: null,
      completedAt: null,
      duration: null,
      outcome: null,
      dealId: 'deal-helio-enterprise',
      contactId: 'contact-lina-helio',
      leadId: null,
      accountId: 'acct-helio',
      customFields: {},
      version: 1,
      createdAt: isoDaysAgo(1),
      updatedAt: isoDaysAgo(1),
    },
    {
      id: 'task-nova-proposal',
      code: 'TSK-2026-000002',
      tenantId: 'default',
      ownerId: 'sara-manager',
      type: 'TASK',
      subject: 'Prepare proposal pack for Nova Retail',
      description: 'Attach quote template, account 360 overview, implementation milestones, and customer success handoff plan.',
      priority: 'HIGH',
      status: 'TODO',
      dueDate: isoDaysFromNow(3),
      startDate: null,
      endDate: null,
      completedAt: null,
      duration: null,
      outcome: null,
      dealId: 'deal-nova-proposal',
      contactId: 'contact-salma-nova',
      leadId: null,
      accountId: 'acct-nova',
      customFields: {},
      version: 1,
      createdAt: isoDaysAgo(2),
      updatedAt: isoDaysAgo(2),
    },
    {
      id: 'task-aurora-kickoff',
      code: 'TSK-2026-000003',
      tenantId: 'default',
      ownerId: 'dev-admin',
      type: 'TASK',
      subject: 'Archive Aurora kickoff evidence',
      description: 'Upload kickoff notes, implementation checklist, and approval trail to the account document library.',
      priority: 'LOW',
      status: 'COMPLETED',
      dueDate: isoDaysAgo(3),
      startDate: null,
      endDate: null,
      completedAt: isoDaysAgo(3),
      duration: null,
      outcome: 'Evidence archived and linked to account.',
      dealId: 'deal-aurora-rollout',
      contactId: 'contact-omar-aurora',
      leadId: null,
      accountId: 'acct-aurora',
      customFields: {},
      version: 1,
      createdAt: isoDaysAgo(5),
      updatedAt: isoDaysAgo(3),
    },
  ];
}

function createPreviewQuotes(): DevQuote[] {
  return [
    {
      id: 'quote-nova-cpq-v1',
      tenantId: 'default',
      dealId: 'deal-nova-proposal',
      accountId: 'acct-nova',
      contactId: 'contact-salma-nova',
      rfqId: 'rfq-nova-cx',
      ownerId: 'sara-manager',
      quoteNumber: 'Q-2026-000003',
      name: 'Nova Retail Customer 360 and CPQ Rollout',
      status: 'DRAFT',
      version: 1,
      currency: 'USD',
      subtotal: '67500',
      discountTotal: '3500',
      taxTotal: '3200',
      total: '67200',
      paymentTerms: '50% on signature, 50% on go-live',
      validUntil: isoDaysFromNow(21),
      expiresAt: isoDaysFromNow(21),
      approvalRequired: true,
      approvalStatus: 'NOT_SUBMITTED',
      lineItems: [
        { id: 'qli-nova-crm', productId: 'prod-crm-enterprise', productName: 'Nexus CRM Enterprise', quantity: 1, unitPrice: '48000', discountPercent: '5', taxPercent: '5', total: '45600' },
        { id: 'qli-nova-impl', productId: 'prod-implementation', productName: 'Implementation Accelerator', quantity: 1, unitPrice: '12500', discountPercent: '0', taxPercent: '5', total: '12500' },
        { id: 'qli-nova-support', productId: 'prod-support', productName: 'Premium Support Pack', quantity: 1, unitPrice: '7200', discountPercent: '0', taxPercent: '5', total: '7200' },
      ],
      terms: 'Includes quote template, approval workflow, account/contact timeline integration, and customer success handoff.',
      notes: 'Created from RFQ and linked to Salma Farid for contact-level tracking.',
      createdAt: isoDaysAgo(1),
      updatedAt: isoDaysAgo(1),
    },
  ];
}

function createPreviewDiscountRequests(): DevDiscountRequest[] {
  return [
    {
      id: 'drq-nova-cpq-v1',
      tenantId: 'default',
      quoteId: 'quote-nova-cpq-v1',
      requestedById: 'sara-manager',
      approvalRequestId: 'approval-nova-drq',
      status: 'PENDING',
      reasonCode: 'STRATEGIC_ACCOUNT',
      reasonLabel: 'Strategic account',
      reasonNotes: 'Nova is a strategic retail logo with expansion potential across six regions.',
      currentDiscountPercent: '5.18',
      requestedDiscountPercent: '12',
      requestedDiscountAmount: '8100',
      winningProbabilityIfApproved: 72,
      businessImpact: 'Approval improves close probability before procurement deadline and protects implementation scope.',
      competitorName: 'Regional CRM incumbent',
      createdAt: isoDaysAgo(1),
      updatedAt: isoDaysAgo(1),
    },
  ];
}

function createPreviewQuoteTemplates(): DevQuoteTemplate[] {
  return [
    {
      id: 'qt-enterprise-v1',
      tenantId: 'default',
      name: 'Enterprise Quote Pack',
      description: 'Default enterprise quote document with CPQ, validity, terms, and signature placeholders.',
      version: 1,
      status: 'ACTIVE',
      language: 'en',
      storageKey: 'quote-templates/default/enterprise-quote-pack-v1',
      contentType: 'text/html',
      isDefault: true,
      isActive: true,
      body: '<h1>{{quoteNumber}}</h1><p>{{name}}</p><p>Total: {{total}}</p><p>Valid until: {{expiresAt}}</p>',
      variables: ['quoteNumber', 'name', 'total', 'expiresAt'],
      createdAt: isoDaysAgo(8),
      updatedAt: isoDaysAgo(2),
    },
  ];
}

function createPreviewQuoteRevisions(): DevQuoteRevision[] {
  return [
    {
      id: 'qrev-nova-v1',
      tenantId: 'default',
      quoteId: 'quote-nova-cpq-v1',
      version: 1,
      reason: 'quote.created',
      status: 'DRAFT',
      snapshot: { quoteNumber: 'Q-2026-000003', total: '67200', expiresAt: isoDaysFromNow(21) },
      createdAt: isoDaysAgo(1),
    },
  ];
}

function createPreviewQuoteDocuments(): DevQuoteDocument[] {
  const renderedHtml = '<h1>Q-2026-000003</h1><p>Nova Retail Customer 360 and CPQ Rollout</p>';
  const contentBase64 = Buffer.from(renderedHtml, 'utf8').toString('base64');
  return [
    {
      id: 'qdoc-nova-html',
      tenantId: 'default',
      quoteId: 'quote-nova-cpq-v1',
      templateId: 'qt-enterprise-v1',
      format: 'HTML',
      status: 'RENDERED',
      fileName: 'Q-2026-000003-v1.html',
      contentType: 'text/html',
      renderedHtml,
      contentBase64,
      contentSize: Buffer.byteLength(renderedHtml, 'utf8'),
      checksum: 'preview-html',
      createdAt: isoDaysAgo(1),
      updatedAt: isoDaysAgo(1),
    },
  ];
}

function createPreviewQuoteESignEnvelopes(): DevQuoteESignEnvelope[] {
  return [
    {
      id: 'qenv-nova-signature',
      tenantId: 'default',
      quoteId: 'quote-nova-cpq-v1',
      documentId: 'qdoc-nova-html',
      provider: 'INTERNAL',
      providerEnvelopeId: 'env-Q-2026-000003',
      status: 'DRAFT',
      recipientName: 'Salma Farid',
      recipientEmail: 'salma.farid@novaretail.example',
      sentById: 'sara-manager',
      sentAt: null,
      createdAt: isoDaysAgo(1),
      updatedAt: isoDaysAgo(1),
    },
  ];
}

function createPreviewOrders(): DevOrder[] {
  return [
    {
      id: 'order-nova-kickoff',
      tenantId: 'default',
      accountId: 'acct-nova',
      contactId: 'contact-salma-nova',
      dealId: 'deal-nova-proposal',
      quoteId: 'quote-nova-cpq-v1',
      ownerId: 'sara-manager',
      orderNumber: 'SO-2026-000003',
      name: 'Nova Retail CPQ implementation kickoff',
      status: 'PENDING_APPROVAL',
      currency: 'USD',
      total: '67200',
      orderedAt: null,
      expectedFulfillmentAt: isoDaysFromNow(45),
      lineItems: [
        { id: 'oli-nova-crm', productId: 'prod-crm-enterprise', productName: 'Nexus CRM Enterprise', quantity: 1, total: '45600' },
        { id: 'oli-nova-impl', productId: 'prod-implementation', productName: 'Implementation Accelerator', quantity: 1, total: '12500' },
        { id: 'oli-nova-support', productId: 'prod-support', productName: 'Premium Support Pack', quantity: 1, total: '7200' },
      ],
      createdAt: isoDaysAgo(1),
      updatedAt: isoDaysAgo(1),
    },
    {
      id: 'order-aurora-rollout',
      tenantId: 'default',
      accountId: 'acct-aurora',
      contactId: 'contact-omar-aurora',
      dealId: 'deal-aurora-rollout',
      quoteId: null,
      ownerId: 'dev-admin',
      orderNumber: 'SO-2026-000002',
      name: 'Aurora Bank revenue workspace rollout',
      status: 'FULFILLING',
      currency: 'USD',
      total: '132000',
      orderedAt: isoDaysAgo(7),
      expectedFulfillmentAt: isoDaysFromNow(20),
      lineItems: [
        { id: 'oli-aurora-crm', productId: 'prod-crm-enterprise', productName: 'Nexus CRM Enterprise', quantity: 1, total: '92000' },
        { id: 'oli-aurora-impl', productId: 'prod-implementation', productName: 'Implementation Accelerator', quantity: 1, total: '40000' },
      ],
      createdAt: isoDaysAgo(7),
      updatedAt: isoDaysAgo(2),
    },
  ];
}

function createPreviewRFQs(): DevRFQ[] {
  return [
    {
      id: 'rfq-nova-cx',
      tenantId: 'default',
      dealId: 'deal-nova-proposal',
      accountId: 'acct-nova',
      contactId: 'contact-salma-nova',
      ownerId: 'sara-manager',
      rfqNumber: 'RFQ-2026-000003',
      title: 'Nova Retail CX Platform Request',
      name: 'Nova Retail CX Platform Request',
      status: 'CONVERTED',
      currency: 'USD',
      convertedQuoteId: 'quote-nova-cpq-v1',
      requestedBy: 'Salma Farid',
      requestedAt: isoDaysAgo(3),
      createdAt: isoDaysAgo(3),
      updatedAt: isoDaysAgo(1),
    },
  ];
}

export function getDevPreviewState(): DevPreviewState {
  if (!globalThis.__nexusDevPreviewState) {
    globalThis.__nexusDevPreviewState = createInitialState();
  } else {
    const defaults = createInitialState();
    globalThis.__nexusDevPreviewState.roles ??= defaults.roles;
    globalThis.__nexusDevPreviewState.users ??= defaults.users;
    globalThis.__nexusDevPreviewState.profile ??= defaults.profile;
    globalThis.__nexusDevPreviewState.scoringRules ??= defaults.scoringRules;
    globalThis.__nexusDevPreviewState.quoteAutomationRules ??= defaults.quoteAutomationRules;
    globalThis.__nexusDevPreviewState.pipelines ??= defaults.pipelines;
    globalThis.__nexusDevPreviewState.products ??= defaults.products;
    globalThis.__nexusDevPreviewState.productKits ??= defaults.productKits;
    globalThis.__nexusDevPreviewState.vendors ??= defaults.vendors;
    globalThis.__nexusDevPreviewState.currencies ??= defaults.currencies;
    globalThis.__nexusDevPreviewState.taxZones ??= defaults.taxZones;
    globalThis.__nexusDevPreviewState.taxRates ??= defaults.taxRates;
    globalThis.__nexusDevPreviewState.accounts ??= defaults.accounts;
    for (const account of defaults.accounts) {
      const existing = globalThis.__nexusDevPreviewState.accounts.find((item) => item.id === account.id);
      if (!existing) {
        globalThis.__nexusDevPreviewState.accounts.push(account);
      } else {
        for (const [key, value] of Object.entries(account)) {
          const current = existing[key];
          if (
            current === undefined ||
            current === null ||
            (typeof current === 'string' && current.trim() === '') ||
            (Array.isArray(current) && current.length === 0)
          ) {
            existing[key] = value;
          }
        }
        existing.customFields = {
          ...(account.customFields ?? {}),
          ...(existing.customFields ?? {}),
        };
        existing.tags = Array.isArray(existing.tags) && existing.tags.length > 0 ? existing.tags : account.tags;
      }
    }
    globalThis.__nexusDevPreviewState.deals ??= defaults.deals;
    globalThis.__nexusDevPreviewState.contacts ??= defaults.contacts;
    for (const contact of defaults.contacts) {
      const existing = globalThis.__nexusDevPreviewState.contacts.find((item) => item.id === contact.id);
      if (!existing) {
        globalThis.__nexusDevPreviewState.contacts.push(contact);
      } else {
        existing.customFields = {
          ...(contact.customFields ?? {}),
          ...(existing.customFields ?? {}),
        };
        existing.tags = Array.isArray(existing.tags) && existing.tags.length > 0 ? existing.tags : contact.tags;
        existing.linkedInUrl ??= contact.linkedInUrl;
        existing.twitterHandle ??= contact.twitterHandle;
        existing.mobile ??= contact.mobile;
        existing.phone ??= contact.phone;
        existing.address ??= contact.address;
        existing.country ??= contact.country;
        existing.city ??= contact.city;
        existing.timezone ??= contact.timezone;
        existing.preferredChannel ??= contact.preferredChannel;
      }
    }
    globalThis.__nexusDevPreviewState.leads ??= defaults.leads;
    globalThis.__nexusDevPreviewState.activities ??= defaults.activities;
    globalThis.__nexusDevPreviewState.quotes ??= defaults.quotes;
    globalThis.__nexusDevPreviewState.discountRequests ??= defaults.discountRequests;
    globalThis.__nexusDevPreviewState.quoteRevisions ??= defaults.quoteRevisions;
    globalThis.__nexusDevPreviewState.quoteTemplates ??= defaults.quoteTemplates;
    globalThis.__nexusDevPreviewState.quoteDocuments ??= defaults.quoteDocuments;
    globalThis.__nexusDevPreviewState.quoteESignEnvelopes ??= defaults.quoteESignEnvelopes;
    globalThis.__nexusDevPreviewState.orders ??= defaults.orders;
    globalThis.__nexusDevPreviewState.rfqs ??= defaults.rfqs;
    globalThis.__nexusDevPreviewState.validationRules ??= defaults.validationRules;
    for (const rule of defaults.validationRules) {
      if (!globalThis.__nexusDevPreviewState.validationRules.some((item) => item.id === rule.id)) {
        globalThis.__nexusDevPreviewState.validationRules.push(rule);
      }
    }
    for (const activity of defaults.activities) {
      if (!globalThis.__nexusDevPreviewState.activities.some((item) => item.id === activity.id)) {
        globalThis.__nexusDevPreviewState.activities.push(activity);
      }
    }
    for (const quote of defaults.quotes) {
      if (!globalThis.__nexusDevPreviewState.quotes.some((item) => item.id === quote.id)) {
        globalThis.__nexusDevPreviewState.quotes.push(quote);
      }
    }
    for (const discountRequest of defaults.discountRequests) {
      if (!globalThis.__nexusDevPreviewState.discountRequests.some((item) => item.id === discountRequest.id)) {
        globalThis.__nexusDevPreviewState.discountRequests.push(discountRequest);
      }
    }
    for (const revision of defaults.quoteRevisions) {
      if (!globalThis.__nexusDevPreviewState.quoteRevisions.some((item) => item.id === revision.id)) {
        globalThis.__nexusDevPreviewState.quoteRevisions.push(revision);
      }
    }
    for (const template of defaults.quoteTemplates) {
      if (!globalThis.__nexusDevPreviewState.quoteTemplates.some((item) => item.id === template.id)) {
        globalThis.__nexusDevPreviewState.quoteTemplates.push(template);
      }
    }
    for (const document of defaults.quoteDocuments) {
      if (!globalThis.__nexusDevPreviewState.quoteDocuments.some((item) => item.id === document.id)) {
        globalThis.__nexusDevPreviewState.quoteDocuments.push(document);
      }
    }
    for (const envelope of defaults.quoteESignEnvelopes) {
      if (!globalThis.__nexusDevPreviewState.quoteESignEnvelopes.some((item) => item.id === envelope.id)) {
        globalThis.__nexusDevPreviewState.quoteESignEnvelopes.push(envelope);
      }
    }
    for (const order of defaults.orders) {
      if (!globalThis.__nexusDevPreviewState.orders.some((item) => item.id === order.id)) {
        globalThis.__nexusDevPreviewState.orders.push(order);
      }
    }
    for (const rfq of defaults.rfqs) {
      if (!globalThis.__nexusDevPreviewState.rfqs.some((item) => item.id === rfq.id)) {
        globalThis.__nexusDevPreviewState.rfqs.push(rfq);
      }
    }
  }
  return globalThis.__nexusDevPreviewState;
}

export function resolveDevContactIdForCommercialRecord(record: Record<string, unknown>) {
  const state = getDevPreviewState();
  const directContactId = typeof record.contactId === 'string' ? record.contactId : '';
  if (directContactId && state.contacts.some((contact) => contact.id === directContactId)) return directContactId;

  const dealId = typeof record.dealId === 'string' ? record.dealId : '';
  if (dealId) {
    const activityContact = state.activities.find((activity) => activity.dealId === dealId && typeof activity.contactId === 'string');
    if (activityContact?.contactId) return String(activityContact.contactId);
  }

  const accountId = typeof record.accountId === 'string' ? record.accountId : '';
  if (accountId) {
    const accountContact = state.contacts.find((contact) => contact.accountId === accountId);
    if (accountContact) return accountContact.id;
  }

  return null;
}

export function recordDevAccountCommercialEvent(
  accountId: string,
  event: {
    topic: string;
    title: string;
    actor?: string;
    aggregateType: 'rfq' | 'quote' | 'order' | 'activity';
    aggregateId: string;
    payload?: Record<string, unknown>;
  }
) {
  const state = getDevPreviewState();
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) return null;

  const now = new Date().toISOString();
  const customFields =
    account.customFields && typeof account.customFields === 'object'
      ? (account.customFields as Record<string, unknown>)
      : {};
  const commercialEvents = Array.isArray(customFields.commercialEvents) ? customFields.commercialEvents : [];

  account.customFields = {
    ...customFields,
    commercialEvents: [
      {
        id: createId('account-commercial-event'),
        topic: event.topic,
        title: event.title,
        actor: event.actor ?? 'Commercial System',
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        at: now,
        payload: event.payload ?? {},
      },
      ...commercialEvents,
    ],
  };
  account.updatedAt = now;
  return account;
}

export function recordDevContactCommercialEvent(
  contactId: string,
  event: {
    topic: string;
    title: string;
    actor?: string;
    aggregateType: 'rfq' | 'quote' | 'activity';
    aggregateId: string;
    payload?: Record<string, unknown>;
  }
) {
  const state = getDevPreviewState();
  const contact = state.contacts.find((item) => item.id === contactId);
  if (!contact) return null;

  const now = new Date().toISOString();
  const customFields =
    contact.customFields && typeof contact.customFields === 'object'
      ? (contact.customFields as Record<string, unknown>)
      : {};
  const auditTrail = Array.isArray(customFields.auditTrail) ? customFields.auditTrail : [];
  const outboxEvents = Array.isArray(customFields.outboxEvents) ? customFields.outboxEvents : [];

  contact.customFields = {
    ...customFields,
    auditTrail: [
      {
        id: createId('audit'),
        action: event.title,
        actor: event.actor ?? 'CPQ System',
        at: now,
        metadata: {
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          ...event.payload,
        },
      },
      ...auditTrail,
    ],
    outboxEvents: [
      {
        id: createId('outbox'),
        topic: event.topic,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        actor: event.actor ?? 'CPQ System',
        status: 'pending',
        createdAt: now,
        payload: event.payload ?? {},
      },
      ...outboxEvents,
    ],
  };
  contact.updatedAt = now;
  return contact;
}

export function validateDevObject(objectType: string, data: Record<string, unknown>) {
  const rules = getDevPreviewState().validationRules.filter(
    (rule) => rule.objectType === objectType && rule.enabled
  );
  const errors: Record<string, string> = {};

  for (const rule of rules) {
    const value = data[rule.field];
    const missing =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0) ||
      (typeof value === 'boolean' && value === false && rule.field.toLowerCase().includes('consent'));

    if (missing) errors[rule.field] = rule.message;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    rules,
  };
}

export function getDevValidationFieldCatalog(objectType?: string) {
  return VALIDATION_FIELD_CATALOG.filter((field) => (objectType ? field.objectType === objectType : true));
}

export function apiSuccess<T>(data: T) {
  return { success: true, data };
}

export function apiError(message: string, code = 'DEV_PREVIEW_ERROR') {
  return { success: false, error: { code, message } };
}

export function paginated<T>(rows: T[], searchParams?: URLSearchParams) {
  // Clamp/normalize: invalid or out-of-range page/limit must never serialize
  // NaN/negative values into the response (RR-010).
  const page = Math.max(1, Math.floor(Number(searchParams?.get('page')) || 1));
  const rawLimit = Math.floor(Number(searchParams?.get('limit')) || (rows.length || 1));
  const limit = Math.min(Math.max(rawLimit, 1), 500);
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / Math.max(limit, 1)));

  return {
    data: rows.slice((page - 1) * limit, page * limit),
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

export function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
