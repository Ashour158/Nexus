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
import { createCommPrisma, tenantAls } from './prisma.js';
import { createSmtpChannel } from './channels/smtp.channel.js';
import { createSmsChannel } from './channels/sms.channel.js';
import { createTemplatesService } from './services/templates.service.js';
import { createOutboxService } from './services/outbox.service.js';
import { createSequencesService } from './services/sequences.service.js';
import { registerTemplatesRoutes } from './routes/templates.routes.js';
import { registerSequencesRoutes } from './routes/sequences.routes.js';
import { registerOutboxRoutes } from './routes/outbox.routes.js';
import { createMailAccountsService } from './services/mail-accounts.service.js';
import { registerMailAccountsRoutes } from './routes/mail-accounts.routes.js';
import { createFieldCryptoFromEnv } from './lib/field-crypto.js';
import { registerWebhookRoutes } from './routes/webhook.routes.js';
import { registerInternalOutboxRoutes } from './routes/internal-outbox.routes.js';
import { createWhatsAppChannel } from './channels/whatsapp.channel.js';
import { registerWhatsAppOutboundRoutes } from './routes/whatsapp-outbound.routes.js';
import { createTelephonyChannel } from './channels/telephony.channel.js';
import { registerTelephonyRoutes } from './routes/telephony.routes.js';
import { NexusProducer } from '@nexus/kafka';
import { registerGraphQL } from './graphql/index.js';
import { startTriggerConsumer } from './consumers/trigger.consumer.js';
import { startGdprConsumer } from './consumers/gdpr.consumer.js';
import { startSequencePoller } from './lib/sequence.poller.js';
import { startOutboxPoller } from './lib/outbox.poller.js';
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

// Bridge Fastify request-context tenantId into Prisma tenant ALS
app.addHook('preHandler', async (request) => {
  const tenantId = (request as any).requestContext?.get('tenantId');
  if (tenantId) tenantAls.enterWith({ tenantId });
});

registerHealthRoutes(app, 'comm-service', [() => checkDatabase(prismaHealth)]);
app.setErrorHandler(globalErrorHandler);

const smtp = createSmtpChannel(app.log);
const sms = createSmsChannel(app.log);
const whatsapp = createWhatsAppChannel(app.log);
const telephony = createTelephonyChannel(app.log);

// CTI telephony event producer. Fail-open: if Kafka is unavailable the webhook
// still updates the call record; only downstream timeline projection is skipped.
let telephonyProducer: NexusProducer | null = new NexusProducer('comm-service');
try {
  await telephonyProducer.connect();
  app.log.info('comm-service telephony event producer connected');
} catch (err) {
  app.log.warn({ err }, 'Telephony event producer connect failed; call.logged events disabled');
  telephonyProducer = null;
}
const templates = createTemplatesService(prisma);
// Per-user mail-provider accounts: AES-256-GCM field crypto (platform master
// key) protects stored SMTP passwords / OAuth tokens.
const fieldCrypto = createFieldCryptoFromEnv();
const mailAccounts = createMailAccountsService(prisma, fieldCrypto);
const outbox = createOutboxService(
  prisma,
  smtp,
  sms,
  telephonyProducer ?? undefined,
  // Send path: resolve a per-user account transport when a message carries a
  // mailAccountId; falls back to system SMTP otherwise.
  (tenantId, mailAccountId) => mailAccounts.getSendChannel(tenantId, mailAccountId)
);
const sequences = createSequencesService(prisma, smtp, templates);

let triggerConsumer: Awaited<ReturnType<typeof startTriggerConsumer>> | null = null;
try {
  triggerConsumer = await startTriggerConsumer({ prisma, outbox, templates, smtp, log: app.log });
} catch (err) {
  app.log.warn({ err }, 'Kafka consumer start failed; HTTP-only mode');
}

const gdprConsumer = await startGdprConsumer(prisma).catch((err) => {
  app.log.warn({ err }, 'GDPR consumer start failed; continuing');
  return null;
});

// Sequence-step poller: advances enrolled contacts through due steps on schedule.
// Fail-open — a start failure must never break the service.
let sequencePoller: ReturnType<typeof startSequencePoller> | null = null;
try {
  sequencePoller = startSequencePoller(prisma, sequences, app.log);
  app.log.info('comm-service sequence poller running');
} catch (err) {
  app.log.warn({ err }, 'Sequence poller start failed; continuing');
}

// Outbox processor poller: flushes QUEUED CommOutbox rows via SMTP/SMS on
// schedule so queued emails send without a manual trigger. Fail-open — a start
// failure must never break the service.
let outboxPoller: ReturnType<typeof startOutboxPoller> | null = null;
try {
  outboxPoller = startOutboxPoller(prisma, outbox, app.log);
  app.log.info('comm-service outbox poller running');
} catch (err) {
  app.log.warn({ err }, 'Outbox poller start failed; continuing');
}

app.addHook('onClose', async () => {
  try {
    sequencePoller?.stop();
  } catch { /* ignore */ }
  try {
    outboxPoller?.stop();
  } catch { /* ignore */ }
  try {
    await triggerConsumer?.disconnect();
  } catch { /* ignore */ }
  try {
    await gdprConsumer?.disconnect();
  } catch { /* ignore */ }
  try {
    await telephonyProducer?.disconnect();
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
  await registerMailAccountsRoutes(a, mailAccounts);
  await registerWebhookRoutes(a, outbox);
  await registerInternalOutboxRoutes(a, outbox);
  await registerWhatsAppOutboundRoutes(a, prisma, whatsapp, telephonyProducer);
  await registerTelephonyRoutes(a, prisma, telephony, telephonyProducer);
});