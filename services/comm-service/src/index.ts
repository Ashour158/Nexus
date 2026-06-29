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
import { PrismaClient } from '../../../node_modules/.prisma/comm-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';
import { createCommPrisma } from './prisma.js';
import { createSmtpChannel } from './channels/smtp.channel.js';
import { createSmsChannel } from './channels/sms.channel.js';
import { createTemplatesService } from './services/templates.service.js';
import { createOutboxService } from './services/outbox.service.js';
import { createSequencesService } from './services/sequences.service.js';
import { registerTemplatesRoutes } from './routes/templates.routes.js';
import { registerSequencesRoutes } from './routes/sequences.routes.js';
import { registerOutboxRoutes } from './routes/outbox.routes.js';
import { registerWebhookRoutes } from './routes/webhook.routes.js';
import { registerInternalOutboxRoutes } from './routes/internal-outbox.routes.js';
import { createWhatsAppChannel } from './channels/whatsapp.channel.js';
import { registerWhatsAppOutboundRoutes } from './routes/whatsapp-outbound.routes.js';
import { registerGraphQL } from './graphql/index.js';
import { startTriggerConsumer } from './consumers/trigger.consumer.js';
import { startGdprConsumer } from './consumers/gdpr.consumer.js';
import './workers/email.worker.js';

startTracing({ serviceName: 'comm-service' });
const prismaHealth = new PrismaClient({
  datasources: {
    db: {
      url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.COMM_DATABASE_URL }),
    },
  },
});
const prisma = createCommPrisma();

const port = Number(process.env.PORT ?? 3009);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}

const app = await createService({
  name: 'comm-service',
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

registerHealthRoutes(app, 'comm-service', [() => checkDatabase(prismaHealth)]);
app.setErrorHandler(globalErrorHandler);

const smtp = createSmtpChannel(app.log);
const sms = createSmsChannel(app.log);
const whatsapp = createWhatsAppChannel(app.log);
const templates = createTemplatesService(prisma);
const outbox = createOutboxService(prisma, smtp, sms);
const sequences = createSequencesService(prisma, smtp, templates);

let triggerConsumer: Awaited<ReturnType<typeof startTriggerConsumer>> | null = null;
try {
  triggerConsumer = await startTriggerConsumer({ prisma, outbox, templates, log: app.log });
} catch (err) {
  app.log.warn({ err }, 'Kafka consumer start failed; HTTP-only mode');
}

const gdprConsumer = await startGdprConsumer(prisma).catch((err) => {
  app.log.warn({ err }, 'GDPR consumer start failed; continuing');
  return null;
});

app.addHook('onClose', async () => {
  try {
    await triggerConsumer?.disconnect();
  } catch { /* ignore */ }
  try {
    await gdprConsumer?.disconnect();
  } catch { /* ignore */ }
  try {
    await prismaHealth.$disconnect();
  } catch { /* ignore */ }
});

await registerGraphQL(app, prisma);

await startService(app, port, async (a) => {
  await registerTemplatesRoutes(a, templates);
  await registerSequencesRoutes(a, sequences);
  await registerOutboxRoutes(a, outbox);
  await registerWebhookRoutes(a, outbox);
  await registerInternalOutboxRoutes(a, outbox);
  await registerWhatsAppOutboundRoutes(a, prisma, whatsapp);
});