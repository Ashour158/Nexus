import {
  Activity,
  Bell,
  Bot,
  Boxes,
  Building2,
  Clock,
  Compass,
  Database,
  DollarSign,
  FileText,
  Gauge,
  GitBranch,
  GitMerge,
  Globe,
  KeyRound,
  Layers,
  LayoutDashboard,
  Lock,
  Mail,
  Map,
  Network,
  Percent,
  Recycle,
  ScrollText,
  Settings,
  ShieldCheck,
  Target,
  ToggleLeft,
  Users,
  Webhook,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * Single source of truth for the consolidated Admin Panel.
 *
 * Each feature `href` points at the EXISTING working route (settings/*, admin/*,
 * or a top-level dashboard route). This registry does NOT move page bodies — it
 * surfaces the already-shipped admin/settings surfaces under one grouped IA so
 * every deep link keeps working. A handful of not-yet-built features point at a
 * `/admin/<slug>` placeholder stub.
 *
 * Shape intentionally mirrors CRM_MODULE_GROUPS (config/module-registry.ts) so
 * the hub + AdminSidebar consume it the same way the main app consumes modules.
 */
export interface AdminFeature {
  id: string;
  label: string;
  /** Existing, working route. Never a dead link. */
  href: string;
  icon: LucideIcon;
  description: string;
  /** Owning group id. */
  group: string;
  adminOnly?: boolean;
  /** True when href is a placeholder stub for a not-yet-built page. */
  placeholder?: boolean;
}

export interface AdminGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
  features: AdminFeature[];
}

export const ADMIN_GROUPS: AdminGroup[] = [
  {
    id: 'organization',
    label: 'Organization',
    icon: Building2,
    description: 'Company identity, org structure, reporting lines, and territories.',
    features: [
      { id: 'company', label: 'Company Profile', href: '/settings/company', icon: Building2, group: 'organization', adminOnly: true, description: 'Company identity, address, logo, timezone, and localization.' },
      { id: 'org-structure', label: 'Org Structure', href: '/settings/org-structure', icon: Network, group: 'organization', adminOnly: true, description: 'Departments (tree) and seniority levels for your organization.' },
      { id: 'org-chart', label: 'Org Chart', href: '/org-chart', icon: Users, group: 'organization', description: 'Reporting hierarchy across the organization (read-only).' },
      { id: 'territories', label: 'Territories', href: '/territories', icon: Map, group: 'organization', adminOnly: true, description: 'Territory assignment, routing, coverage, and account ownership.' },
    ],
  },
  {
    id: 'users-access',
    label: 'Users & Access',
    icon: ShieldCheck,
    description: 'People, roles, permission matrices, field-level access, and SSO.',
    features: [
      { id: 'users', label: 'Users', href: '/admin/users', icon: Users, group: 'users-access', adminOnly: true, description: 'Invite users, assign roles, manage status and accounts.' },
      { id: 'roles', label: 'Roles & Permissions', href: '/admin/roles', icon: Lock, group: 'users-access', adminOnly: true, description: 'Role definitions, permission matrix, and RBAC configuration.' },
      { id: 'field-permissions', label: 'Field Permissions', href: '/settings/field-permissions', icon: ShieldCheck, group: 'users-access', adminOnly: true, description: 'Field-level read/write access control per role.' },
      { id: 'sso', label: 'Single Sign-On', href: '/settings/sso', icon: KeyRound, group: 'users-access', adminOnly: true, description: 'SAML/SSO configuration, metadata, and tenant auth policy.' },
    ],
  },
  {
    id: 'data-governance',
    label: 'Data & Governance',
    icon: Database,
    description: 'Data model, quality, privacy, compliance, and record recovery.',
    features: [
      { id: 'custom-fields', label: 'Custom Fields', href: '/settings/custom-fields', icon: Database, group: 'data-governance', adminOnly: true, description: 'Low-code entity fields, field types, and validation hooks.' },
      { id: 'module-builder', label: 'Module Builder', href: '/settings/modules', icon: Boxes, group: 'data-governance', adminOnly: true, description: 'Custom modules, fields, Canvas layouts, and record models.' },
      { id: 'validation-rules', label: 'Validation Rules', href: '/admin/validation-rules', icon: GitBranch, group: 'data-governance', adminOnly: true, description: 'Record validation rules and blocking conditions.' },
      { id: 'data-quality', label: 'Data Quality', href: '/settings/data-quality', icon: Gauge, group: 'data-governance', adminOnly: true, description: 'Completeness scoring, health metrics, and quality rules.' },
      { id: 'duplicates', label: 'Duplicates', href: '/settings/duplicates', icon: GitMerge, group: 'data-governance', adminOnly: true, description: 'Duplicate scan, merge, and dedup group management.' },
      { id: 'data-privacy', label: 'Data Privacy', href: '/settings/data-privacy', icon: Lock, group: 'data-governance', adminOnly: true, description: 'Ownership transfer, privacy actions, and consent controls.' },
      { id: 'gdpr', label: 'GDPR', href: '/settings/gdpr', icon: ShieldCheck, group: 'data-governance', adminOnly: true, description: 'Erasure requests, privacy workflows, and compliance tracking.' },
      { id: 'recycle-bin', label: 'Recycle Bin', href: '/recycle-bin', icon: Recycle, group: 'data-governance', adminOnly: true, description: 'Soft-deleted records, restore, archive, and retention.' },
      { id: 'migration', label: 'Migration', href: '/settings/migration', icon: Database, group: 'data-governance', adminOnly: true, description: 'CSV import, migration jobs, field mapping, and onboarding.' },
    ],
  },
  {
    id: 'sales-cpq',
    label: 'Sales & CPQ',
    icon: DollarSign,
    description: 'Pipelines, scoring, quote configuration, tax, currency, and approvals.',
    features: [
      { id: 'pipelines', label: 'Pipelines', href: '/settings/pipelines', icon: Layers, group: 'sales-cpq', adminOnly: true, description: 'Pipeline definitions, stages, default pipeline, and process setup.' },
      { id: 'scoring-rules', label: 'Scoring Rules', href: '/settings/scoring-rules', icon: Target, group: 'sales-cpq', adminOnly: true, description: 'Deterministic lead scoring rules, signals, and points.' },
      { id: 'quote-admin', label: 'Quote Administration', href: '/settings/quotes', icon: FileText, group: 'sales-cpq', adminOnly: true, description: 'Quote numbering, approval tiers, and discount thresholds.' },
      { id: 'quote-automation', label: 'Quote Automation', href: '/settings/quote-automation', icon: Zap, group: 'sales-cpq', adminOnly: true, description: 'Versioned quote templates, defaults, and render controls.' },
      { id: 'tax', label: 'Tax', href: '/settings/tax', icon: Percent, group: 'sales-cpq', adminOnly: true, description: 'Tax zones, tax rates, and finance localization.' },
      { id: 'currencies', label: 'Currencies', href: '/settings/currencies', icon: DollarSign, group: 'sales-cpq', adminOnly: true, description: 'Currency setup and exchange rates.' },
      { id: 'approvals-policy', label: 'Approval Policies', href: '/approvals', icon: ShieldCheck, group: 'sales-cpq', adminOnly: true, description: 'Approval policies, discount approval, and governance queues.' },
    ],
  },
  {
    id: 'automation',
    label: 'Automation',
    icon: Zap,
    description: 'Workflows, journeys, automation rules, and AI models.',
    features: [
      { id: 'workflows', label: 'Workflows', href: '/workflows', icon: GitBranch, group: 'automation', adminOnly: true, description: 'Low-code workflow builder, execution engine, and SLA nodes.' },
      { id: 'journeys', label: 'Journeys', href: '/command-center', icon: Compass, group: 'automation', adminOnly: true, description: 'Lifecycle journey builder: triggers, steps, and enrollments.' },
      // TODO: dedicated automation-rules admin page not built yet — placeholder stub.
      { id: 'automation-rules', label: 'Automation Rules', href: '/admin/automation-rules', icon: Bot, group: 'automation', adminOnly: true, placeholder: true, description: 'Event-driven automation rules (assignment, notifications, field updates).' },
      { id: 'ai-models', label: 'AI Models', href: '/settings/ai-models', icon: Bot, group: 'automation', adminOnly: true, description: 'AI model configuration for scoring, enrichment, and assist.' },
    ],
  },
  {
    id: 'communications',
    label: 'Communications',
    icon: Mail,
    description: 'Notifications, portal, SLA policies, and mail accounts.',
    features: [
      { id: 'notification-prefs', label: 'Notification Preferences', href: '/settings/notifications', icon: Bell, group: 'communications', description: 'Per-channel notification preferences and delivery rules.' },
      { id: 'portal', label: 'Customer Portal', href: '/portal/settings', icon: Globe, group: 'communications', adminOnly: true, description: 'Portal settings, deal rooms, quote sharing, and external access.' },
      { id: 'sla-policies', label: 'SLA Policies', href: '/tickets/sla-policies', icon: Clock, group: 'communications', adminOnly: true, description: 'Support SLA policies, response/resolution targets, and escalation.' },
      // TODO: dedicated mail-accounts admin page not built yet — placeholder stub.
      { id: 'mail-accounts', label: 'Mail Accounts', href: '/admin/mail-accounts', icon: Mail, group: 'communications', adminOnly: true, placeholder: true, description: 'Shared/team mailboxes and outbound sending domains.' },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: Webhook,
    description: 'Third-party integrations, live connections, webhooks, and API keys.',
    features: [
      { id: 'integrations', label: 'Integrations', href: '/settings/integrations', icon: Zap, group: 'integrations', adminOnly: true, description: 'Mail, calendar, maps, Slack, Teams, ZATCA, and ERP integrations.' },
      { id: 'connections', label: 'Connections & Sync', href: '/integrations', icon: Network, group: 'integrations', adminOnly: true, description: 'Live OAuth connections, scopes, expiry, and sync jobs.' },
      { id: 'webhooks', label: 'Webhooks', href: '/settings/integrations/webhooks', icon: Webhook, group: 'integrations', adminOnly: true, description: 'Outbound webhook subscriptions, signing secrets, and delivery logs.' },
      // TODO: dedicated API keys management page not built yet — placeholder stub.
      { id: 'api-keys', label: 'API Keys', href: '/admin/api-keys', icon: KeyRound, group: 'integrations', adminOnly: true, placeholder: true, description: 'Programmatic API keys, scopes, and rotation.' },
    ],
  },
  {
    id: 'system-ops',
    label: 'System & Ops',
    icon: Activity,
    description: 'Platform overview, tenants, feature flags, audit, health, and settings.',
    features: [
      { id: 'overview', label: 'Overview', href: '/admin', icon: LayoutDashboard, group: 'system-ops', adminOnly: true, description: 'Platform KPIs, recent signups, and system alerts.' },
      { id: 'tenants', label: 'Tenants', href: '/admin/tenants', icon: Building2, group: 'system-ops', adminOnly: true, description: 'Tenant management, provisioning, and configuration.' },
      { id: 'flags', label: 'Feature Flags', href: '/admin/flags', icon: ToggleLeft, group: 'system-ops', adminOnly: true, description: 'Runtime feature flag toggles per tenant/environment.' },
      { id: 'audit', label: 'Audit Log', href: '/admin/audit', icon: ScrollText, group: 'system-ops', adminOnly: true, description: 'System-wide audit trail of security and data events.' },
      { id: 'health', label: 'System Health', href: '/admin/health', icon: Activity, group: 'system-ops', adminOnly: true, description: 'Live per-service health, latency, and queue depth.' },
      { id: 'system-settings', label: 'System Settings', href: '/admin/settings', icon: Settings, group: 'system-ops', adminOnly: true, description: 'Platform-level configuration and defaults.' },
    ],
  },
];

/** Flattened features with their group metadata attached. */
export const ADMIN_FEATURES = ADMIN_GROUPS.flatMap((group) =>
  group.features.map((feature) => ({
    ...feature,
    groupId: group.id,
    groupLabel: group.label,
  }))
);
