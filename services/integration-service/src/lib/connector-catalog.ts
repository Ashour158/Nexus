/**
 * Server-side connector catalog for the Integration Hub.
 *
 * This is intentionally a typed constant (not a DB table): it describes the
 * connectors the platform knows how to integrate with, so the web UI can render
 * the connector cards dynamically instead of hardcoding them. The list is served
 * via `GET /api/v1/integrations/catalog`, which cross-references each entry with
 * the caller's live OAuthConnection rows to add a per-tenant `connected` flag.
 */

export type ConnectorAuthType = 'oauth' | 'apikey' | 'none';
export type ConnectorStatus = 'available' | 'beta' | 'planned';
export type ConnectorOAuthProvider = 'google' | 'microsoft' | 'slack';

export interface ConnectorCatalogEntry {
  /** Stable connector id used by the UI (kebab-case). */
  id: string;
  name: string;
  description: string;
  /** Grouping category for the UI (e.g. Communication, Calendar). */
  category: string;
  authType: ConnectorAuthType;
  /** Underlying provider key; aligns with OAuthConnection.provider where applicable. */
  provider: string;
  /** OAuth provider used to build the connect URL. Only for authType === 'oauth'. */
  oauthProvider?: ConnectorOAuthProvider;
  /** OAuth scopes requested at connect time. Only for authType === 'oauth'. */
  scopes?: string[];
  /** Domain event types this connector can drive via webhooks. */
  supportedEvents?: string[];
  docsUrl?: string;
  status: ConnectorStatus;
}

const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
];

const MICROSOFT_SCOPES = [
  'offline_access',
  'User.Read',
  'Mail.Read',
  'Mail.Send',
  'Calendars.ReadWrite',
];

const SLACK_SCOPES = [
  'chat:write',
  'users:read',
  'users:read.email',
  'channels:read',
  'groups:read',
  'im:read',
  'mpim:read',
];

/**
 * The served connector catalog. Keep this in sync with the OAuth scopes in
 * `oauth.routes.ts` for the oauth connectors.
 */
export const CONNECTOR_CATALOG: readonly ConnectorCatalogEntry[] = [
  {
    id: 'google-workspace',
    name: 'Google Workspace',
    description: 'Sync Google Calendar events and send/read Gmail on behalf of connected users.',
    category: 'Calendar',
    authType: 'oauth',
    provider: 'google',
    oauthProvider: 'google',
    scopes: GOOGLE_SCOPES,
    supportedEvents: ['calendar.event.created', 'calendar.event.updated', 'email.message.sent'],
    docsUrl: 'https://developers.google.com/workspace',
    status: 'available',
  },
  {
    id: 'microsoft-365',
    name: 'Microsoft 365',
    description: 'Connect Outlook mail and calendar (Microsoft Graph) for two-way sync.',
    category: 'Calendar',
    authType: 'oauth',
    provider: 'microsoft',
    oauthProvider: 'microsoft',
    scopes: MICROSOFT_SCOPES,
    supportedEvents: ['calendar.event.created', 'calendar.event.updated', 'email.message.sent'],
    docsUrl: 'https://learn.microsoft.com/en-us/graph/overview',
    status: 'available',
  },
  {
    id: 'microsoft-teams',
    name: 'Microsoft Teams',
    description: 'Post deal and pipeline notifications to Microsoft Teams channels.',
    category: 'Communication',
    authType: 'oauth',
    provider: 'microsoft',
    oauthProvider: 'microsoft',
    scopes: MICROSOFT_SCOPES,
    supportedEvents: ['deal.stage.changed', 'deal.won', 'deal.lost'],
    docsUrl: 'https://learn.microsoft.com/en-us/microsoftteams/platform/',
    status: 'beta',
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Send CRM notifications and messages to Slack channels and users.',
    category: 'Communication',
    authType: 'oauth',
    provider: 'slack',
    oauthProvider: 'slack',
    scopes: SLACK_SCOPES,
    supportedEvents: ['deal.stage.changed', 'deal.won', 'deal.lost', 'lead.assigned'],
    docsUrl: 'https://api.slack.com/',
    status: 'available',
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Read and send email from connected Gmail mailboxes (part of Google Workspace).',
    category: 'Email',
    authType: 'oauth',
    provider: 'google',
    oauthProvider: 'google',
    scopes: GOOGLE_SCOPES,
    supportedEvents: ['email.message.sent', 'email.message.received'],
    docsUrl: 'https://developers.google.com/gmail/api',
    status: 'available',
  },
  {
    id: 'docusign',
    name: 'DocuSign',
    description: 'Send documents for e-signature and track envelope status.',
    category: 'eSign',
    authType: 'oauth',
    // No OAuth handler wired in integration-service yet; e-sign flows live in the web app.
    provider: 'docusign',
    docsUrl: 'https://developers.docusign.com/',
    status: 'planned',
  },
  {
    id: 'zapier',
    name: 'Zapier',
    description: 'Trigger Zaps from CRM events via outbound webhooks (no OAuth required).',
    category: 'Automation',
    authType: 'apikey',
    provider: 'zapier',
    supportedEvents: [
      'deal.created',
      'deal.stage.changed',
      'deal.won',
      'deal.lost',
      'lead.created',
      'contact.created',
    ],
    docsUrl: 'https://platform.zapier.com/',
    status: 'planned',
  },
  {
    id: 'zatca',
    name: 'ZATCA e-Invoicing',
    description: 'Saudi ZATCA (Fatoora) e-invoice clearance and reporting.',
    category: 'Tax',
    authType: 'apikey',
    provider: 'zatca',
    docsUrl: 'https://zatca.gov.sa/en/E-Invoicing/Pages/default.aspx',
    status: 'planned',
  },
] as const;
