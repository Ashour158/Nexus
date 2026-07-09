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
import { NexusProducer } from '@nexus/kafka';
import { PrismaClient } from '../../../node_modules/.prisma/integration-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';
import { createIntegrationPrisma } from './prisma.js';
import { createFieldCrypto } from './lib/crypto.js';
import { createWebhooksService } from './services/webhooks.service.js';
import { createConnectionsService } from './services/connections.service.js';
import { createCatalogService } from './services/catalog.service.js';
import { createSyncService } from './services/sync.service.js';
import { createOauthService } from './services/oauth.service.js';
import { createGoogleCalendarService } from './services/google-calendar.service.js';
import { createGoogleGmailService } from './services/google-gmail.service.js';
import { createGeocodingService } from './services/geocoding.service.js';
import { registerWebhooksRoutes } from './routes/webhooks.routes.js';
import { registerConnectionsRoutes } from './routes/connections.routes.js';
import { registerCatalogRoutes } from './routes/catalog.routes.js';
import { registerSyncRoutes } from './routes/sync.routes.js';
import { registerOauthRoutes } from './routes/oauth.routes.js';
import { registerCalendarRoutes } from './routes/calendar.routes.js';
import { registerEmailRoutes } from './routes/email.routes.js';
import { registerGraphQL } from './graphql/index.js';
import { startIntegrationEventsConsumer } from './consumers/events.consumer.js';
import { startWebhookDeliveryPoller } from './workers/webhook-delivery.poller.js';
import { webhookQueue } from './queues/webhook.queue.js';

startTracing({ serviceName: 'integration-service' });
const rawPrisma = new PrismaClient({
  datasources: {
    db: {
      url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.INTEGRATION_DATABASE_URL }),
    },
  },
});
const prisma = createIntegrationPrisma();
const producer = new NexusProducer('integration-service');

const key = process.env.INTEGRATION_ENCRYPTION_KEY ?? process.env.INTEGRATION_SECRET_KEY;
if (!key || key.length < 32) {
  throw new Error('INTEGRATION_ENCRYPTION_KEY or INTEGRATION_SECRET_KEY must be set to at least 32 characters.');
}
const crypto = createFieldCrypto(key);

const port = Number(process.env.PORT ?? 3012);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}

const app = await createService({
  name: 'integration-service',
  port,
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3100')
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

registerHealthRoutes(app, 'integration-service', [() => checkDatabase(rawPrisma)]);
app.setErrorHandler(globalErrorHandler);

const webhooks = createWebhooksService({ prisma, raw: rawPrisma, crypto });
const connections = createConnectionsService(prisma, crypto);
const catalog = createCatalogService(prisma);
const sync = createSyncService(prisma, producer, crypto);
const oauth = createOauthService(prisma, crypto);
const calendar = createGoogleCalendarService(prisma, crypto);
const gmail = createGoogleGmailService(prisma, crypto, oauth);
const geocoding = createGeocodingService(prisma);

let eventsConsumer: Awaited<ReturnType<typeof startIntegrationEventsConsumer>> | null = null;

try {
  await producer.connect();
  app.log.info('Integration Kafka producer connected');
} catch (err) {
  app.log.warn({ err }, 'Kafka producer connect failed');
}

try {
  eventsConsumer = await startIntegrationEventsConsumer(webhooks, calendar, geocoding);
  app.log.info('Integration events consumer started');
} catch (err) {
  app.log.warn({ err }, 'Kafka consumer start failed');
}

// Drive the DB-backed outbound webhook delivery queue. Fail-open: if the poller
// cannot start it must never block the service or its endpoints.
let webhookDeliveryPoller: ReturnType<typeof startWebhookDeliveryPoller> | null = null;
try {
  webhookDeliveryPoller = startWebhookDeliveryPoller(webhooks);
  app.log.info('Webhook delivery poller started');
} catch (err) {
  app.log.warn({ err }, 'Webhook delivery poller start failed');
}

app.addHook('onClose', async () => {
  try { webhookDeliveryPoller?.stop(); } catch { /* ignore */ }
  try { await eventsConsumer?.disconnect(); } catch { /* ignore */ }
  try { await producer.disconnect(); } catch { /* ignore */ }
  try { await webhookQueue.close(); } catch { /* ignore */ }
  await rawPrisma.$disconnect();
});

await registerGraphQL(app, prisma);

await startService(app, port, async (a) => {
  await registerWebhooksRoutes(a, webhooks);
  await registerConnectionsRoutes(a, connections);
  await registerCatalogRoutes(a, catalog);
  await registerSyncRoutes(a, sync);
  await registerOauthRoutes(a, oauth);
  await registerCalendarRoutes(a, prisma, calendar, crypto);
  await registerEmailRoutes(a, gmail);
});
