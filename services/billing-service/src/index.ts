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
import { PrismaClient } from '../../../node_modules/.prisma/billing-client/index.js';
import { createBillingPrisma } from './prisma.js';
import { createPlansService } from './services/plans.service.js';
import { createSubscriptionsService } from './services/subscriptions.service.js';
import { createBillingInvoicesService } from './services/invoices.service.js';
import { registerPlansRoutes } from './routes/plans.routes.js';
import { registerSubscriptionsRoutes } from './routes/subscriptions.routes.js';
import { registerInvoicesRoutes } from './routes/invoices.routes.js';
import { registerStripeWebhookRoutes } from './routes/webhooks.routes.js';

const prismaHealth = new PrismaClient();
const rawPrisma = new PrismaClient();
const prisma = createBillingPrisma();
const producer = new NexusProducer('billing-service');

const port = Number(process.env.PORT ?? 3011);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}

const app = await createService({
  name: 'billing-service',
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

registerHealthRoutes(app, 'billing-service', [() => checkDatabase(prismaHealth)]);
app.setErrorHandler(globalErrorHandler);

try {
  await producer.connect();
} catch (err) {
  app.log.warn({ err }, 'Kafka producer connect failed');
}

app.addHook('onClose', async () => {
  try {
    await producer.disconnect();
  } catch {
    /* ignore */
  }
  await rawPrisma.$disconnect();
});

const plans = createPlansService(prisma);
const subscriptions = createSubscriptionsService(prisma, producer);
const invoices = createBillingInvoicesService(prisma, producer);

await startService(app, port, async (a) => {
  await registerPlansRoutes(a, plans);
  await registerSubscriptionsRoutes(a, subscriptions);
  await registerInvoicesRoutes(a, invoices);
  await registerStripeWebhookRoutes(a, subscriptions);
});