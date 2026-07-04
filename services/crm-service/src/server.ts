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
import { startEngagementTimelineConsumer } from './consumers/engagement-timeline.consumer.js';
import { NexusProducer } from '@nexus/kafka';
import { startRottenDealsPoller } from './lib/rotten-deals.poller.js';
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
  const engagementTimelineConsumer = await startEngagementTimelineConsumer(prisma).catch((err) => {
    app.log.warn({ err }, 'Engagement timeline consumer failed to start; continuing without email/portal timeline projection');
    return null;
  });

  // Stage-gating rotten-deal detector. Guarded so a start failure can never
  // break the service; the interval is unref'd inside the poller.
  let rottenDealsPoller: ReturnType<typeof startRottenDealsPoller> | null = null;
  try {
    const intervalRaw = optionalEnv('ROTTEN_DEALS_INTERVAL_MS', '');
    const intervalMs = intervalRaw ? Number(intervalRaw) : undefined;
    rottenDealsPoller = startRottenDealsPoller(prisma, producer, {
      intervalMs: intervalMs && Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : undefined,
    });
    app.log.info('Rotten-deals poller started');
  } catch (err) {
    app.log.warn({ err }, 'Rotten-deals poller failed to start; continuing without stage-gating');
  }

  app.addHook('onClose', async () => {
    try { await producer.disconnect(); } catch { /* ignore */ }
    try { await scoringConsumer?.disconnect(); } catch { /* ignore */ }
    try { await gdprConsumer?.disconnect(); } catch { /* ignore */ }
    try { await financeTimelineConsumer?.disconnect(); } catch { /* ignore */ }
    try { await engagementTimelineConsumer?.disconnect(); } catch { /* ignore */ }
    try { rottenDealsPoller?.stop(); } catch { /* ignore */ }
  });

  await registerAllRoutes(app, prisma, producer);
  await registerGraphQL(app, prisma);

  return { app, prismaHealth };
}
