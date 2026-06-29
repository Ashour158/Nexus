import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import {
  checkDatabase,
  createService,
  globalErrorHandler,
  optionalEnv,
  registerHealthRoutes,
  requireEnv,
  startService,
} from '@nexus/service-utils';
import rateLimit from '@fastify/rate-limit';
import { NexusProducer } from '@nexus/kafka';
import { PrismaClient } from '../../../node_modules/.prisma/finance-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';
import { createFinancePrisma } from './prisma.js';
import { registerAllRoutes } from './routes/index.js';
import { registerGraphQL } from './graphql/index.js';
import { startAutoQuoteConsumer } from './consumers/auto-quote.consumer.js';
import { startGdprConsumer } from './consumers/gdpr.consumer.js';
import { startApprovalConsumer } from './consumers/approval.consumer.js';

startTracing({ serviceName: 'finance-service' });
const prismaHealth = new PrismaClient({
  datasources: {
    db: {
      url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10 }),
    },
  },
});
const prisma = createFinancePrisma();
const producer = new NexusProducer('finance-service');

const env = requireEnv(['DATABASE_URL', 'JWT_SECRET']);
const port = Number(optionalEnv('PORT', '3002'));
const jwtSecret = env.JWT_SECRET;

const app = await createService({
  name: 'finance-service',
  port,
  jwtSecret,
  corsOrigins: optionalEnv('CORS_ORIGINS', 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim()),
});

registerHealthRoutes(app, 'finance-service', [() => checkDatabase(prismaHealth)]);

app.setErrorHandler(globalErrorHandler);

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

try {
  await producer.connect();
  app.log.info('Kafka producer connected');
} catch (err) {
  app.log.warn({ err }, 'Kafka producer connect failed; continuing without event publishing');
}

let autoQuoteConsumer: Awaited<ReturnType<typeof startAutoQuoteConsumer>> | null = null;
try {
  autoQuoteConsumer = await startAutoQuoteConsumer(prisma, app.log, producer);
  app.log.info('Auto-quote consumer started');
} catch (err) {
  app.log.warn({ err }, 'Auto-quote consumer failed to start; continuing without auto-quoting');
}

const gdprConsumer = await startGdprConsumer(prisma).catch((err) => {
  app.log.warn({ err }, 'GDPR consumer failed to start; continuing');
  return null;
});

const approvalConsumer = await startApprovalConsumer(prisma, app.log).catch((err) => {
  app.log.warn({ err }, 'Approval consumer failed to start; continuing');
  return null;
});

app.addHook('onClose', async () => {
  try { await producer.disconnect(); } catch { /* ignore */ }
  try { await autoQuoteConsumer?.disconnect(); } catch { /* ignore */ }
  try { await gdprConsumer?.disconnect(); } catch { /* ignore */ }
  try { await approvalConsumer?.disconnect(); } catch { /* ignore */ }
});

await registerAllRoutes(app, prisma, producer);
await registerGraphQL(app, prisma);

await startService(app, port, async () => {
  await prismaHealth.$disconnect();
});
