import 'dotenv/config';
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
import { createIntegrationPrisma } from './prisma.js';
import { createFieldCrypto } from './lib/crypto.js';
import { createWebhooksService } from './services/webhooks.service.js';
import { createConnectionsService } from './services/connections.service.js';
import { createSyncService } from './services/sync.service.js';
import { createOauthService } from './services/oauth.service.js';
import { createGoogleCalendarService } from './services/google-calendar.service.js';
import { createGoogleGmailService } from './services/google-gmail.service.js';
import { createGeocodingService } from './services/geocoding.service.js';
import { registerWebhooksRoutes } from './routes/webhooks.routes.js';
import { registerConnectionsRoutes } from './routes/connections.routes.js';
import { registerSyncRoutes } from './routes/sync.routes.js';
import { registerOauthRoutes } from './routes/oauth.routes.js';
import { registerCalendarRoutes } from './routes/calendar.routes.js';
import { registerEmailRoutes } from './routes/email.routes.js';
import { startIntegrationEventsConsumer } from './consumers/events.consumer.js';

const rawPrisma = new PrismaClient();
const prisma = createIntegrationPrisma();
const producer = new NexusProducer('integration-service');

const key = process.env.INTEGRATION_ENCRYPTION_KEY ?? process.env.INTEGRATION_SECRET_KEY ?? '';
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
const connections = createConnectionsService(prisma);
const sync = createSyncService(prisma, producer);
const oauth = createOauthService(prisma, crypto);
const calendar = createGoogleCalendarService(prisma);
const gmail = createGoogleGmailService(prisma);
const geocoding = createGeocodingService(prisma);

let eventsConsumer: Awaited<ReturnType<typeof startIntegrationEventsConsumer>> | null = null;
const deliveryTimer = setInterval(() => {
  void webhooks.processDeliveryQueue(40).catch((err) => app.log.warn({ err }, 'webhook delivery sweep failed'));
}, 30_000);

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

app.addHook('onClose', async () => {
  clearInterval(deliveryTimer);
  try { await eventsConsumer?.disconnect(); } catch { /* ignore */ }
  try { await producer.disconnect(); } catch { /* ignore */ }
  await rawPrisma.$disconnect();
});

await startService(app, port, async (a) => {
  await registerWebhooksRoutes(a, webhooks);
  await registerConnectionsRoutes(a, connections);
  await registerSyncRoutes(a, sync);
  await registerOauthRoutes(a, oauth);
  await registerCalendarRoutes(a, calendar, gmail);
  await registerEmailRoutes(a, gmail);
});