/**
 * Static merge-field catalog for the WYSIWYG Template Designer.
 *
 * The designer's "insert field" menu reads {@link getMergeFields} to list the
 * tokens available for a given CRM module. Tokens use dotted notation
 * (`{{deal.name}}`) which the shared render engine in `templates.service.ts`
 * resolves via bracket lookup on a flat `Record<string,string>` keyed by the
 * INNER token (e.g. `"deal.name"`).
 *
 * This is a purely static catalog — no DB/network access. It intentionally
 * covers the common CRM fields plus a few system tokens; extend the group
 * arrays below as the product grows.
 */

export type MergeField = {
  /** Full token as it appears in a template body, e.g. `{{deal.name}}`. */
  token: string;
  /** Human label for the designer menu, e.g. `Deal Name`. */
  label: string;
  /** Menu grouping, e.g. `Deal`, `Account`, `System`. */
  group: string;
};

export const TEMPLATE_MODULES = ['lead', 'contact', 'account', 'deal', 'quote'] as const;
export type TemplateModule = (typeof TEMPLATE_MODULES)[number];

export function isTemplateModule(v: string): v is TemplateModule {
  return (TEMPLATE_MODULES as readonly string[]).includes(v);
}

/** A field definition before the `{{ }}` wrapper is applied. */
type FieldDef = { path: string; label: string; group: string; sample: string };

const LEAD_FIELDS: FieldDef[] = [
  { path: 'lead.firstName', label: 'Lead First Name', group: 'Lead', sample: 'Jordan' },
  { path: 'lead.lastName', label: 'Lead Last Name', group: 'Lead', sample: 'Rivera' },
  { path: 'lead.fullName', label: 'Lead Full Name', group: 'Lead', sample: 'Jordan Rivera' },
  { path: 'lead.email', label: 'Lead Email', group: 'Lead', sample: 'jordan.rivera@example.com' },
  { path: 'lead.phone', label: 'Lead Phone', group: 'Lead', sample: '+1 (555) 010-2233' },
  { path: 'lead.company', label: 'Lead Company', group: 'Lead', sample: 'Northwind Traders' },
  { path: 'lead.title', label: 'Lead Job Title', group: 'Lead', sample: 'VP of Operations' },
  { path: 'lead.status', label: 'Lead Status', group: 'Lead', sample: 'Qualified' },
  { path: 'lead.source', label: 'Lead Source', group: 'Lead', sample: 'Website' },
];

const CONTACT_FIELDS: FieldDef[] = [
  { path: 'contact.firstName', label: 'Contact First Name', group: 'Contact', sample: 'Alex' },
  { path: 'contact.lastName', label: 'Contact Last Name', group: 'Contact', sample: 'Morgan' },
  { path: 'contact.fullName', label: 'Contact Full Name', group: 'Contact', sample: 'Alex Morgan' },
  { path: 'contact.email', label: 'Contact Email', group: 'Contact', sample: 'alex.morgan@example.com' },
  { path: 'contact.phone', label: 'Contact Phone', group: 'Contact', sample: '+1 (555) 019-8844' },
  { path: 'contact.title', label: 'Contact Job Title', group: 'Contact', sample: 'Head of Procurement' },
];

const ACCOUNT_FIELDS: FieldDef[] = [
  { path: 'account.name', label: 'Account Name', group: 'Account', sample: 'Acme Corporation' },
  { path: 'account.industry', label: 'Account Industry', group: 'Account', sample: 'Manufacturing' },
  { path: 'account.website', label: 'Account Website', group: 'Account', sample: 'https://acme.example.com' },
  { path: 'account.phone', label: 'Account Phone', group: 'Account', sample: '+1 (555) 000-1212' },
  { path: 'account.city', label: 'Account City', group: 'Account', sample: 'Austin' },
  { path: 'account.country', label: 'Account Country', group: 'Account', sample: 'United States' },
];

const DEAL_FIELDS: FieldDef[] = [
  { path: 'deal.name', label: 'Deal Name', group: 'Deal', sample: 'Acme — Platform Rollout' },
  { path: 'deal.amount', label: 'Deal Amount', group: 'Deal', sample: '$48,000.00' },
  { path: 'deal.currency', label: 'Deal Currency', group: 'Deal', sample: 'USD' },
  { path: 'deal.stage', label: 'Deal Stage', group: 'Deal', sample: 'Proposal' },
  { path: 'deal.closeDate', label: 'Deal Close Date', group: 'Deal', sample: 'Aug 31, 2026' },
  { path: 'deal.owner', label: 'Deal Owner', group: 'Deal', sample: 'Sam Carter' },
];

const QUOTE_FIELDS: FieldDef[] = [
  { path: 'quote.number', label: 'Quote Number', group: 'Quote', sample: 'Q-2026-0042' },
  { path: 'quote.title', label: 'Quote Title', group: 'Quote', sample: 'Platform Rollout — Annual' },
  { path: 'quote.total', label: 'Quote Total', group: 'Quote', sample: '$48,000.00' },
  { path: 'quote.subtotal', label: 'Quote Subtotal', group: 'Quote', sample: '$45,000.00' },
  { path: 'quote.tax', label: 'Quote Tax', group: 'Quote', sample: '$3,000.00' },
  { path: 'quote.currency', label: 'Quote Currency', group: 'Quote', sample: 'USD' },
  { path: 'quote.validUntil', label: 'Quote Valid Until', group: 'Quote', sample: 'Aug 15, 2026' },
  { path: 'quote.status', label: 'Quote Status', group: 'Quote', sample: 'Sent' },
];

const SYSTEM_FIELDS: FieldDef[] = [
  { path: 'today', label: "Today's Date", group: 'System', sample: 'July 13, 2026' },
  { path: 'now', label: 'Current Date & Time', group: 'System', sample: 'July 13, 2026 9:42 AM' },
  { path: 'user.name', label: 'Current User Name', group: 'Current User', sample: 'Sam Carter' },
  { path: 'user.email', label: 'Current User Email', group: 'Current User', sample: 'sam.carter@example.com' },
  { path: 'company.name', label: 'Your Company Name', group: 'Current User', sample: 'Nexus CRM' },
];

/**
 * Which field groups each module exposes. A module shows its own primary
 * entity plus the related entities a designer commonly needs, followed by the
 * always-available system/user tokens.
 */
const MODULE_FIELD_DEFS: Record<TemplateModule, FieldDef[]> = {
  lead: [...LEAD_FIELDS, ...SYSTEM_FIELDS],
  contact: [...CONTACT_FIELDS, ...ACCOUNT_FIELDS, ...SYSTEM_FIELDS],
  account: [...ACCOUNT_FIELDS, ...CONTACT_FIELDS, ...SYSTEM_FIELDS],
  deal: [...DEAL_FIELDS, ...ACCOUNT_FIELDS, ...CONTACT_FIELDS, ...SYSTEM_FIELDS],
  quote: [...QUOTE_FIELDS, ...ACCOUNT_FIELDS, ...DEAL_FIELDS, ...CONTACT_FIELDS, ...SYSTEM_FIELDS],
};

function toMergeField(f: FieldDef): MergeField {
  return { token: `{{${f.path}}}`, label: f.label, group: f.group };
}

/**
 * Ordered list of merge fields available for a module, for the designer's
 * "insert field" menu. Defaults to the `deal` module if an unknown value is
 * passed (callers should validate first).
 */
export function getMergeFields(module: TemplateModule): MergeField[] {
  return (MODULE_FIELD_DEFS[module] ?? MODULE_FIELD_DEFS.deal).map(toMergeField);
}

/**
 * Flat placeholder dataset keyed by the INNER token (`"deal.name"`), used by
 * the preview endpoint when the caller supplies no `sampleData`. Shape matches
 * what the render engine's bracket lookup expects.
 */
export function getSampleData(module: TemplateModule): Record<string, string> {
  const defs = MODULE_FIELD_DEFS[module] ?? MODULE_FIELD_DEFS.deal;
  const out: Record<string, string> = {};
  for (const f of defs) out[f.path] = f.sample;
  // Live system tokens override the static samples so previews feel real.
  const now = new Date();
  out['today'] = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  out['now'] = now.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return out;
}
