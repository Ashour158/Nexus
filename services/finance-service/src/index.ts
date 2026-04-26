import 'dotenv/config';
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
import { createFinancePrisma } from './prisma.js';
import { registerAllRoutes } from './routes/index.js';

const prismaHealth = new PrismaClient();
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

app.addHook('onClose', async () => {
  try { await producer.disconnect(); } catch { /* ignore */ }
  await prismaHealth.$disconnect();
});

await startService(app, port, async (a) => {
  await registerAllRoutes(a, prisma, producer);
});