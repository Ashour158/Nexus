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

  AUTH_DATABASE_URL: z.string().url(),
  CRM_DATABASE_URL: z.string().url(),
  APPROVAL_DATABASE_URL: z.string().url(),
  ANALYTICS_DATABASE_URL: z.string().url(),
  INTEGRATION_DATABASE_URL: z.string().url(),
  REPORTING_DATABASE_URL: z.string().url(),
  TERRITORY_DATABASE_URL: z.string().url(),
  FINANCE_DATABASE_URL: z.string().url(),
  NOTIFICATION_DATABASE_URL: z.string().url(),
  WORKFLOW_DATABASE_URL: z.string().url(),
  COMM_DATABASE_URL: z.string().url(),
  DOCUMENT_DATABASE_URL: z.string().url(),
  CADENCE_DATABASE_URL: z.string().url(),
  PLANNING_DATABASE_URL: z.string().url(),
  PORTAL_DATABASE_URL: z.string().url(),
  KNOWLEDGE_DATABASE_URL: z.string().url(),
  INCENTIVE_DATABASE_URL: z.string().url(),
  EMAIL_SYNC_DATABASE_URL: z.string().url(),
  CONTACTS_DATABASE_URL: z.string().url(),
  DEALS_DATABASE_URL: z.string().url(),
  LEADS_DATABASE_URL: z.string().url(),
  ACCOUNTS_DATABASE_URL: z.string().url(),
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
  return serviceDbKeys.map(({ name, envKey }) => ({
    name,
    dbUrl: env[envKey] as string,
  }));
}
