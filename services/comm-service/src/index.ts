import 'dotenv/config';
import rateLimit from '@fastify/rate-limit';
import {
  checkDatabase,
  createService,
  globalErrorHandler,
  registerHealthRoutes,
  startService,
} from '@nexus/service-utils';
import { PrismaClient } from '../../../node_modules/.prisma/comm-client/index.js';
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
import { startTriggerConsumer } from './consumers/trigger.consumer.js';

const prismaHealth = new PrismaClient();
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
const templates = createTemplatesService(prisma);
const outbox = createOutboxService(prisma, smtp, sms);
const sequences = createSequencesService(prisma, smtp, templates);

let triggerConsumer: Awaited<ReturnType<typeof startTriggerConsumer>> | null = null;
try {
  triggerConsumer = await startTriggerConsumer({ prisma, outbox, templates, log: app.log });
} catch (err) {
  app.log.warn({ err }, 'Kafka consumer start failed; HTTP-only mode');
}

app.addHook('onClose', async () => {
  try {
    await triggerConsumer?.disconnect();
  } catch { /* ignore */ }
  await prismaHealth.$disconnect();
});

await startService(app, port, async (a) => {
  await registerTemplatesRoutes(a, templates);
  await registerSequencesRoutes(a, sequences);
  await registerOutboxRoutes(a, outbox);
  await registerWebhookRoutes(a, outbox);
});