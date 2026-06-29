import { startTracing } from '@nexus/service-utils/tracing';
import { createService, startService, globalErrorHandler } from '@nexus/service-utils';
import { NexusConsumer, TOPICS } from '@nexus/kafka';
import { getPrisma } from './prisma.js';
import { createContestsService } from './services/contests.service.js';
import { createBadgesService } from './services/badges.service.js';
import { registerContestsRoutes } from './routes/contests.routes.js';
import { registerBadgesRoutes } from './routes/badges.routes.js';
import { registerGraphQL } from './graphql/index.js';

startTracing({ serviceName: 'incentive-service' });
const port = parseInt(process.env.PORT ?? '3024', 10);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}

const app = await createService({
  name: 'incentive-service',
  port,
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
});

const prisma = getPrisma();
const contests = createContestsService(prisma);
const badges = createBadgesService(prisma);
const consumer = new NexusConsumer('incentive-service');

app.setErrorHandler(globalErrorHandler);

await badges.seedSystemBadges();
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
  try { await consumer.disconnect(); } catch { /* ignore */ }
});

await registerGraphQL(app, prisma);

await startService(app, port, async () => {
  await registerContestsRoutes(app, contests);
  await registerBadgesRoutes(app, badges);
});
