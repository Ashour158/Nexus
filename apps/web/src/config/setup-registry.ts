import {
  Activity,
  Bell,
  BellRing,
  Bot,
  Boxes,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  Coins,
  Columns3,
  Compass,
  CopyCheck,
  Database,
  FileCheck,
  FileJson,
  FileText,
  Gauge,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Globe2,
  Import,
  KeyRound,
  Languages,
  Layers,
  LayoutGrid,
  LayoutTemplate,
  List,
  Lock,
  Mail,
  Network,
  Palette,
  Percent,
  Plug,
  Route,
  ScrollText,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  ToggleLeft,
  User,
  Users,
  Webhook,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

/**
 * Single source of truth for the unified, Zoho-style **Setup** area.
 *
 * Every configuration + administration surface lives under one route tree
 * (`/settings/*`). This registry drives BOTH the two-pane Setup rail
 * (settings/layout.tsx) and the Setup landing card grid (settings/page.tsx),
 * so there is exactly one place to add/reorder items.
 *
 * `isNew`   — page created during the Setup consolidation; may show an empty
 *             state until its backend endpoint is deployed.
 * `external`— routes outside the /settings tree (opened in the same app shell).
 */
export interface SetupItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  isNew?: boolean;
  external?: boolean;
}

export interface SetupCategory {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
  items: SetupItem[];
}

export const SETUP_CATEGORIES: SetupCategory[] = [
  {
    id: 'general',
    label: 'General',
    icon: Settings,
    description: 'Personal, company, localization, modules, and platform basics.',
    items: [
      { id: 'profile', label: 'Personal Settings', href: '/settings/profile', icon: User, description: 'Your profile, preferences, and personal defaults.' },
      { id: 'account', label: 'Account & Security', href: '/settings/account', icon: Shield, description: 'Profile, notifications, MFA/security, and personal API keys.' },
      { id: 'company', label: 'Company Settings', href: '/settings/company', icon: Building2, description: 'Company identity, address, logo, timezone, and localization.' },
      { id: 'currencies', label: 'Currencies', href: '/settings/currencies', icon: Coins, description: 'Currency setup and exchange rates.' },
      { id: 'tax', label: 'Taxes', href: '/settings/tax', icon: Percent, description: 'Tax zones, tax rates, and finance localization.' },
      { id: 'modules', label: 'Modules & Pipelines', href: '/settings/modules', icon: Boxes, description: 'Modules, record models, and Canvas layouts.' },
      { id: 'pipelines', label: 'Pipelines', href: '/settings/pipelines', icon: Layers, description: 'Pipeline definitions, stages, and default pipeline.' },
      { id: 'flags', label: 'Feature Flags', href: '/settings/flags', icon: ToggleLeft, description: 'Runtime feature-flag toggles per tenant/environment.' },
      { id: 'health', label: 'System Health', href: '/settings/health', icon: Activity, description: 'Live per-service health, latency, and queue depth.' },
      { id: 'tenants', label: 'Tenants', href: '/settings/tenants', icon: Building2, description: 'Tenant management, provisioning, and configuration.' },
      { id: 'territories', label: 'Territories', href: '/settings/territories', icon: Globe2, description: 'Segment and route records by geography, industry, size, or custom rules.', isNew: true },
      { id: 'system', label: 'System Settings', href: '/settings/system', icon: SlidersHorizontal, description: 'Platform-level configuration and defaults.' },
    ],
  },
  {
    id: 'users-control',
    label: 'Users & Control',
    icon: ShieldCheck,
    description: 'People, roles, access control, org structure, SSO, and compliance.',
    items: [
      { id: 'users', label: 'Users', href: '/settings/users', icon: Users, description: 'Invite users, assign roles, and manage accounts.' },
      { id: 'roles', label: 'Roles & Permissions', href: '/settings/roles', icon: Lock, description: 'Role definitions, permission matrix, and RBAC.' },
      { id: 'field-permissions', label: 'Field-Level Security', href: '/settings/field-permissions', icon: ShieldCheck, description: 'Field-level read/write access control per role.' },
      { id: 'org-structure', label: 'Org Structure', href: '/settings/org-structure', icon: Network, description: 'Departments (tree) and seniority levels.' },
      { id: 'data-sharing', label: 'Data Sharing', href: '/settings/data-sharing', icon: Share2, description: 'Org-wide default record visibility and criteria-based sharing rules.', isNew: true },
      { id: 'sso', label: 'Single Sign-On', href: '/settings/sso', icon: KeyRound, description: 'SAML/SSO configuration and tenant auth policy.' },
      { id: 'audit', label: 'Audit Log', href: '/settings/audit', icon: ScrollText, description: 'System-wide audit trail of security and data events.' },
      { id: 'data-privacy', label: 'Data Privacy', href: '/settings/data-privacy', icon: Lock, description: 'Ownership transfer, privacy actions, and consent.' },
      { id: 'gdpr', label: 'GDPR', href: '/settings/gdpr', icon: Shield, description: 'Erasure requests, privacy workflows, and compliance.' },
    ],
  },
  {
    id: 'customization',
    label: 'Customization',
    icon: Palette,
    description: 'Custom fields, validation, picklists, layouts, and review processes.',
    items: [
      { id: 'custom-fields', label: 'Custom Fields', href: '/settings/custom-fields', icon: Database, description: 'Low-code entity fields, field types, and validation hooks.' },
      { id: 'validation-rules', label: 'Validation Rules', href: '/settings/validation-rules', icon: GitBranch, description: 'Record validation rules and blocking conditions.' },
      { id: 'modules-custom', label: 'Modules', href: '/settings/modules', icon: Boxes, description: 'Custom modules, fields, and record layouts.' },
      { id: 'global-picklist-sets', label: 'Global Picklist Sets', href: '/settings/global-picklist-sets', icon: List, description: 'Reusable picklist value sets shared across fields.', isNew: true },
      { id: 'layouts', label: 'Page Layouts & Layout Rules', href: '/settings/layouts', icon: LayoutGrid, description: 'Per-module page layouts and dynamic layout rules.', isNew: true },
      { id: 'review-process', label: 'Review Process', href: '/settings/review-process', icon: GitPullRequest, description: 'Maker-checker review configuration for record changes.', isNew: true },
      { id: 'config-export-import', label: 'Config Export/Import', href: '/settings/config-export-import', icon: FileJson, description: 'Move low-code customization between environments as a JSON bundle.', isNew: true },
      { id: 'label-translations', label: 'Label Translations', href: '/settings/label-translations', icon: Languages, description: 'Localize field, module, and picklist labels per locale.', isNew: true },
    ],
  },
  {
    id: 'automation',
    label: 'Automation',
    icon: Workflow,
    description: 'Workflows, automation & scoring rules, assignment, escalation, approvals.',
    items: [
      { id: 'workflows', label: 'Workflow Rules', href: '/settings/workflows', icon: Workflow, description: 'Low-code workflow builder, execution engine, and SLA nodes.' },
      { id: 'automation-rules', label: 'Automation Rules', href: '/settings/automation-rules', icon: Bot, description: 'Event-driven assignment, notifications, and field updates.' },
      { id: 'scoring-rules', label: 'Scoring Rules', href: '/settings/scoring-rules', icon: Target, description: 'Deterministic record scoring rules, conditions, and points.' },
      { id: 'threshold-alerts', label: 'Threshold Alerts', href: '/settings/threshold-alerts', icon: BellRing, description: 'Notify roles or users when a record field crosses a threshold.', isNew: true },
      { id: 'quote-automation', label: 'Quote Automation', href: '/settings/quote-automation', icon: FileText, description: 'Versioned quote templates, defaults, and render controls.' },
      { id: 'quotes', label: 'Quote Administration', href: '/settings/quotes', icon: FileCheck, description: 'Quote numbering, approval tiers, and discount thresholds.' },
      { id: 'assignment-rules', label: 'Assignment Rules', href: '/settings/assignment-rules', icon: Route, description: 'Round-robin and criteria-based record assignment.', isNew: true },
      { id: 'escalation-rules', label: 'Escalation Rules', href: '/settings/escalation-rules', icon: Clock, description: 'Time-based escalation of records and SLAs.', isNew: true },
      { id: 'blueprint-transitions', label: 'Blueprint Transitions', href: '/settings/blueprint-transitions', icon: Compass, description: 'State-machine transitions and stage-gating for records.', isNew: true },
      { id: 'approvals', label: 'Approval Processes', href: '/approvals', icon: CheckCircle2, description: 'Approval policies, requests, and governance queues.', external: true },
    ],
  },
  {
    id: 'data-admin',
    label: 'Data Administration',
    icon: Database,
    description: 'Import, data quality, deduplication, and notifications.',
    items: [
      { id: 'migration', label: 'Import & Migration', href: '/settings/migration', icon: Import, description: 'CSV import, migration jobs, field mapping, and onboarding.' },
      { id: 'data-quality', label: 'Data Quality', href: '/settings/data-quality', icon: Gauge, description: 'Completeness scoring, health metrics, and quality rules.' },
      { id: 'duplicates', label: 'Duplicates', href: '/settings/duplicates', icon: GitMerge, description: 'Duplicate scan, merge, and dedup group management.' },
      { id: 'duplicate-rules', label: 'Duplicate Rules', href: '/settings/duplicate-rules', icon: CopyCheck, description: 'Per-module duplicate detection rules and on-demand scans.', isNew: true },
      { id: 'scheduled-jobs', label: 'Scheduled Jobs', href: '/settings/scheduled-jobs', icon: CalendarClock, description: 'Recurring import/export jobs on a cron schedule.', isNew: true },
      { id: 'mapping-templates', label: 'Mapping Templates', href: '/settings/mapping-templates', icon: Columns3, description: 'Reusable column-to-field mappings for CSV imports.', isNew: true },
      { id: 'notifications', label: 'Notifications', href: '/settings/notifications', icon: Bell, description: 'Per-channel notification preferences and delivery rules.' },
    ],
  },
  {
    id: 'channels',
    label: 'Channels & Marketplace',
    icon: Webhook,
    description: 'Integrations, mail accounts, API keys, and AI models.',
    items: [
      { id: 'templates', label: 'Templates', href: '/settings/templates', icon: LayoutTemplate, description: 'WYSIWYG email, SMS, and document templates with merge fields and live preview.', isNew: true },
      { id: 'integrations', label: 'Integrations', href: '/settings/integrations', icon: Plug, description: 'Mail, calendar, maps, Slack, Teams, ZATCA, and ERP integrations.' },
      { id: 'outbound-webhooks', label: 'Outbound Webhooks', href: '/settings/outbound-webhooks', icon: Webhook, description: 'Push CRM events to external endpoints and inspect deliveries.', isNew: true },
      { id: 'mail-accounts', label: 'Email & Mail Accounts', href: '/settings/mail-accounts', icon: Mail, description: 'Shared/team mailboxes and outbound sending domains.' },
      { id: 'api-keys', label: 'API Keys', href: '/settings/api-keys', icon: KeyRound, description: 'Programmatic API keys, scopes, and rotation.' },
      { id: 'ai-models', label: 'AI Models', href: '/settings/ai-models', icon: Sparkles, description: 'AI model configuration for scoring, enrichment, and assist.' },
    ],
  },
];

/** Flattened items with their owning category metadata attached. */
export const SETUP_ITEMS = SETUP_CATEGORIES.flatMap((category) =>
  category.items.map((item) => ({
    ...item,
    categoryId: category.id,
    categoryLabel: category.label,
  }))
);
