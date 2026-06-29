import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import rateLimit from '@fastify/rate-limit';
import {
  checkDatabase,
  createService,
  globalErrorHandler,
  registerHealthRoutes,
  startService,
} from '@nexus/service-utils';
import { PrismaClient } from '../../../node_modules/.prisma/notification-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';
import { createNotificationPrisma } from './prisma.js';
import { createEmailChannel } from './channels/email.channel.js';
import { createInAppChannel, type InAppNotificationInput } from './channels/in-app.channel.js';
import { startDealConsumer } from './consumers/deal.consumer.js';
import { startActivityConsumer } from './consumers/activity.consumer.js';
import { startQuoteConsumer } from './consumers/quote.consumer.js';
import { registerNotificationsRoutes } from './routes/notifications.routes.js';
import { registerGraphQL } from './graphql/index.js';
import { NexusProducer, TOPICS } from '@nexus/kafka';

startTracing({ serviceName: 'notification-service' });
const prismaHealth = new PrismaClient({
  datasources: {
    db: {
      url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.NOTIFICATION_DATABASE_URL }),
    },
  },
});
const prisma = createNotificationPrisma();

const port = Number(process.env.PORT ?? 3003);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error(
    'JWT_SECRET must be set to at least 32 characters (Section 26).'
  );
}

const app = await createService({
  name: 'notification-service',
  port,
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim()),
});
await app.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: '1 minute',
  errorResponseBuilder: (_req, context) => ({
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: `Too many requests. Retry after ${context.after}.`,
  }),
});

registerHealthRoutes(app, 'notification-service', [
  () => checkDatabase(prismaHealth),
]);

app.setErrorHandler(globalErrorHandler);

const email = createEmailChannel(app.log);

// Kafka producer for real-time push via NOTIFICATIONS topic
let kafkaProducer: NexusProducer | undefined;
try {
  kafkaProducer = new NexusProducer({ clientId: 'notification-service' });
  await kafkaProducer.connect();
} catch (err) {
  app.log.warn({ err }, 'Kafka producer unavailable — real-time push disabled');
  kafkaProducer = undefined;
}

const inApp = createInAppChannel(prisma, kafkaProducer);

/**
 * Resolves an owner's contact info from the auth-service. Best-effort; any
 * failure returns an empty object so the consumers fall back to in-app only.
 */
async function lookupOwner(
  tenantId: string,
  userId: string
): Promise<{ email?: string; name?: string }> {
  const base = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3010/api/v1';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    const res = (await fetch(`${base}/users/${userId}`, {
      headers: {
        'x-internal-service': 'notification-service',
        'x-tenant-id': tenantId,
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer))) as unknown as {
      ok: boolean;
      json: () => Promise<unknown>;
    };
    if (!res.ok) return {};
    const json = (await res.json()) as { data?: unknown };
    const body = (json.data ?? json) as {
      email?: string;
      firstName?: string;
      lastName?: string;
    };
    return {
      email: body?.email,
      name: [body?.firstName, body?.lastName].filter(Boolean).join(' ') || undefined,
    };
  } catch {
    return {};
  }
}

// Start Kafka consumers. If the cluster is unavailable we log and continue —
// the HTTP surface still works for reading / marking-read.
try {
  await startDealConsumer({ inApp, email, lookupOwner, log: app.log });
  await startActivityConsumer({ inApp, log: app.log });
  await startQuoteConsumer({ inApp, email, log: app.log });
} catch (err) {
  app.log.warn({ err }, 'Kafka consumers failed to start; HTTP-only mode');
}

app.addHook('onClose', async () => {
  await prismaHealth.$disconnect();
});

await registerGraphQL(app, prisma);

await startService(app, port, async (a) => {
  await registerNotificationsRoutes(a, prisma);
});