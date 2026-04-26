import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { NexusConsumer, TOPICS } from '@nexus/kafka';
import { globalErrorHandler, startService } from '@nexus/service-utils';
import { getPrisma } from './prisma.js';
import { createContestsService } from './services/contests.service.js';
import { createBadgesService } from './services/badges.service.js';
import { registerContestsRoutes } from './routes/contests.routes.js';
import { registerBadgesRoutes } from './routes/badges.routes.js';

const app = Fastify({ logger: true });
const prisma = getPrisma();
const contests = createContestsService(prisma);
const badges = createBadgesService(prisma);
const consumer = new NexusConsumer('incentive-service');

await app.register(fastifyJwt, {
  secret: process.env.JWT_SECRET ?? 'nexus-development-secret-at-least-32',
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
app.setErrorHandler(globalErrorHandler);

app.addHook('onRequest', async (request, reply) => {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ success: false, error: 'Unauthorized' });
  }
});
await badges.seedSystemBadges();
await registerContestsRoutes(app, contests);
await registerBadgesRoutes(app, badges);
await consumer.subscribe([TOPICS.DEALS]).catch(() => undefined);
consumer.on('deal.won', async (event) => {
  const payload = event.payload as { ownerId?: string; amount?: number | string };
  if (!payload.ownerId) return;
  await badges.checkAndAward(event.tenantId, payload.ownerId, 'DEALS_WON_COUNT', 1);
  await badges.checkAndAward(
    event.tenantId,
    payload.ownerId,
    'DEAL_VALUE', Number(payload.amount ?? 0));
});

await consumer.start().catch(() => undefined);

app.addHook('onClose', async () => {
  try { await consumer.stop(); } catch { /* ignore */ }
});

const port = parseInt(process.env.PORT ?? '3024', 10);
await startService(app, port, async () => {
  await prisma.$disconnect();
});