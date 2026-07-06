import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import { createService, startService, globalErrorHandler, registerHealthRoutes, checkDatabase } from '@nexus/service-utils';
import { NexusConsumer } from '@nexus/kafka';
import { getPrisma } from './prisma.js';
import { createContestsService } from './services/contests.service.js';
import { createBadgesService } from './services/badges.service.js';
import { createMetricsService } from './services/metrics.service.js';
import { createCommissionService } from './services/commission.service.js';
import { registerIncentiveConsumers, INCENTIVE_TOPICS } from './consumers.js';
import { registerContestsRoutes } from './routes/contests.routes.js';
import { registerBadgesRoutes } from './routes/badges.routes.js';
import { registerCommissionRoutes } from './routes/commission.routes.js';
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
const metrics = createMetricsService(prisma);
const commission = createCommissionService(prisma);
const consumer = new NexusConsumer('incentive-service');

app.setErrorHandler(globalErrorHandler);
registerHealthRoutes(app, 'incentive-service', [() => checkDatabase(prisma)]);

await badges.seedSystemBadges().catch((err) => {
  app.log.warn({ err }, 'seedSystemBadges failed; continuing');
});

// Event-driven contest metrics + badge counters. Guarded so unavailable
// Kafka/DB cannot crash boot: subscribe/start are best-effort, and each
// handler isolates its own failures (see consumers.ts).
registerIncentiveConsumers(consumer, { contests, badges, metrics, commission });
await consumer.subscribe([...INCENTIVE_TOPICS]).catch((err) => {
  app.log.warn({ err }, 'Kafka subscribe failed; contest metrics will rely on the periodic fallback');
});
await consumer.start().catch((err) => {
  app.log.warn({ err }, 'Kafka consumer start failed; contest metrics will rely on the periodic fallback');
});

// Fallback: periodic leaderboard rank refresh in case events were missed
// (Kafka downtime, replayed offsets, etc.). Event-driven updates remain primary.
let stopContestWorker: (() => void) | undefined;
try {
  stopContestWorker = contests.startContestWorker();
} catch (err) {
  app.log.warn({ err }, 'periodic contest worker failed to start');
}

app.addHook('onClose', async () => {
  try { stopContestWorker?.(); } catch { /* ignore */ }
  try { await consumer.disconnect(); } catch { /* ignore */ }
});

await registerGraphQL(app, prisma);

await startService(app, port, async () => {
  await registerContestsRoutes(app, contests);
  await registerBadgesRoutes(app, badges);
  await registerCommissionRoutes(app, commission);
});
