import { createService, globalErrorHandler, registerHealthRoutes, requireEnv, optionalEnv, checkDatabase } from '@nexus/service-utils';
import rateLimit from '@fastify/rate-limit';
import { PrismaClient } from '../../../node_modules/.prisma/crm-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';
import { createCrmPrisma } from './prisma.js';
import { registerAllRoutes } from './routes/index.js';
import { registerGraphQL } from './graphql/index.js';
import { startScoringConsumer } from './consumers/scoring.consumer.js';
import { startGdprConsumer } from './consumers/gdpr.consumer.js';
import { startFinanceTimelineConsumer } from './consumers/finance-timeline.consumer.js';
import { NexusProducer } from '@nexus/kafka';
import type { FastifyInstance } from 'fastify';

export async function buildServer(): Promise<{ app: FastifyInstance; prismaHealth: PrismaClient }> {
  const prismaHealth = new PrismaClient({
    datasources: { db: { url: buildDatabaseUrl({ connectionLimit: 1, poolTimeout: 5 }) } },
  });
  const producer = new NexusProducer('crm-service');
  const prisma = createCrmPrisma();
  const env = requireEnv(['DATABASE_URL', 'JWT_SECRET']);
  const jwtSecret = env.JWT_SECRET;

  const app = await createService({
    name: 'crm-service',
    port: Number(optionalEnv('PORT', '3001')),
    jwtSecret,
    corsOrigins: optionalEnv('CORS_ORIGINS', 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim()),
  });

  registerHealthRoutes(app, 'crm-service', [() => checkDatabase(prismaHealth)]);
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

  const scoringConsumer = await startScoringConsumer(prisma).catch((err) => {
    app.log.warn({ err }, 'Scoring consumer failed to start; continuing without scoring stream');
    return null;
  });
  const gdprConsumer = await startGdprConsumer(prisma).catch((err) => {
    app.log.warn({ err }, 'GDPR consumer failed to start; continuing without GDPR stream');
    return null;
  });
  const financeTimelineConsumer = await startFinanceTimelineConsumer(prisma).catch((err) => {
    app.log.warn({ err }, 'Finance timeline consumer failed to start; continuing without finance timeline projection');
    return null;
  });

  app.addHook('onClose', async () => {
    try { await producer.disconnect(); } catch { /* ignore */ }
    try { await scoringConsumer?.disconnect(); } catch { /* ignore */ }
    try { await gdprConsumer?.disconnect(); } catch { /* ignore */ }
    try { await financeTimelineConsumer?.disconnect(); } catch { /* ignore */ }
  });

  await registerAllRoutes(app, prisma, producer);
  await registerGraphQL(app, prisma);

  return { app, prismaHealth };
}
