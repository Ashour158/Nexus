import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.string().default('3027'),
  JWT_SECRET: z.string().min(32),
  KAFKA_BROKERS: z.string().default('localhost:9092'),
  KAFKA_CLIENT_ID: z.string().default('outbox-relay'),
  POLL_INTERVAL_MS: z.coerce.number().default(5000),
  BATCH_SIZE: z.coerce.number().default(100),
  MAX_RETRIES: z.coerce.number().default(3),
  DLQ_ENABLED: z.enum(['true', 'false']).default('true'),

  DLQ_REPLAY_ENABLED: z.enum(['true', 'false']).default('false'),
  DLQ_REPLAY_BATCH_SIZE: z.coerce.number().default(100),
  DLQ_REPLAY_INTERVAL_MS: z.coerce.number().default(60000),

  AUTH_DATABASE_URL: z.string().url().optional(),
  CRM_DATABASE_URL: z.string().url().optional(),
  APPROVAL_DATABASE_URL: z.string().url().optional(),
  ANALYTICS_DATABASE_URL: z.string().url().optional(),
  INTEGRATION_DATABASE_URL: z.string().url().optional(),
  REPORTING_DATABASE_URL: z.string().url().optional(),
  TERRITORY_DATABASE_URL: z.string().url().optional(),
  FINANCE_DATABASE_URL: z.string().url().optional(),
  NOTIFICATION_DATABASE_URL: z.string().url().optional(),
  WORKFLOW_DATABASE_URL: z.string().url().optional(),
  COMM_DATABASE_URL: z.string().url().optional(),
  DOCUMENT_DATABASE_URL: z.string().url().optional(),
  CADENCE_DATABASE_URL: z.string().url().optional(),
  PLANNING_DATABASE_URL: z.string().url().optional(),
  PORTAL_DATABASE_URL: z.string().url().optional(),
  KNOWLEDGE_DATABASE_URL: z.string().url().optional(),
  INCENTIVE_DATABASE_URL: z.string().url().optional(),
  EMAIL_SYNC_DATABASE_URL: z.string().url().optional(),
  CONTACTS_DATABASE_URL: z.string().url().optional(),
  DEALS_DATABASE_URL: z.string().url().optional(),
  LEADS_DATABASE_URL: z.string().url().optional(),
  ACCOUNTS_DATABASE_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadConfig(): Env {
  return envSchema.parse(process.env);
}

export interface ServiceConfig {
  name: string;
  dbUrl: string;
}

const serviceDbKeys: Array<{ name: string; envKey: keyof Env }> = [
  { name: 'auth', envKey: 'AUTH_DATABASE_URL' },
  { name: 'crm', envKey: 'CRM_DATABASE_URL' },
  { name: 'approval', envKey: 'APPROVAL_DATABASE_URL' },
  { name: 'analytics', envKey: 'ANALYTICS_DATABASE_URL' },
  { name: 'integration', envKey: 'INTEGRATION_DATABASE_URL' },
  { name: 'reporting', envKey: 'REPORTING_DATABASE_URL' },
  { name: 'territory', envKey: 'TERRITORY_DATABASE_URL' },
  { name: 'finance', envKey: 'FINANCE_DATABASE_URL' },
  { name: 'notification', envKey: 'NOTIFICATION_DATABASE_URL' },
  { name: 'workflow', envKey: 'WORKFLOW_DATABASE_URL' },
  { name: 'comm', envKey: 'COMM_DATABASE_URL' },
  { name: 'document', envKey: 'DOCUMENT_DATABASE_URL' },
  { name: 'cadence', envKey: 'CADENCE_DATABASE_URL' },
  { name: 'planning', envKey: 'PLANNING_DATABASE_URL' },
  { name: 'portal', envKey: 'PORTAL_DATABASE_URL' },
  { name: 'knowledge', envKey: 'KNOWLEDGE_DATABASE_URL' },
  { name: 'incentive', envKey: 'INCENTIVE_DATABASE_URL' },
  { name: 'email-sync', envKey: 'EMAIL_SYNC_DATABASE_URL' },
  { name: 'contacts', envKey: 'CONTACTS_DATABASE_URL' },
  { name: 'deals', envKey: 'DEALS_DATABASE_URL' },
  { name: 'leads', envKey: 'LEADS_DATABASE_URL' },
  { name: 'accounts', envKey: 'ACCOUNTS_DATABASE_URL' },
];

export function getServiceConfigs(env: Env): ServiceConfig[] {
  // Only relay for services whose DATABASE_URL is configured. A relay deployment
  // need not have connectivity to every service DB to start; unset services are
  // simply skipped rather than failing startup.
  return serviceDbKeys
    .map(({ name, envKey }) => ({ name, dbUrl: env[envKey] as string | undefined }))
    .filter((s): s is ServiceConfig => typeof s.dbUrl === 'string' && s.dbUrl.length > 0);
}
