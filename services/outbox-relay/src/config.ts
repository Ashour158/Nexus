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
});

export type Env = z.infer<typeof envSchema>;

export function loadConfig(): Env {
  return envSchema.parse(process.env);
}

export interface ServiceConfig {
  name: string;
  dbUrl: string;
}

const serviceNames = [
  'auth',
  'crm',
  'approval',
  'analytics',
  'integration',
  'reporting',
  'territory',
  'finance',
] as const;

export function getServiceConfigs(env: Env): ServiceConfig[] {
  return serviceNames.map((name) => ({
    name,
    dbUrl: env[`${name.toUpperCase()}_DATABASE_URL` as keyof Env] as string,
  }));
}
