import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import { createService, startService, globalErrorHandler, registerHealthRoutes, checkDatabase } from '@nexus/service-utils';
import rateLimit from '@fastify/rate-limit';
import { NexusProducer } from '@nexus/kafka';
import { getPrisma, tenantAls } from './prisma.js';
import { createQuotasService } from './services/quotas.service.js';
import { createQuotaService } from './services/quota.service.js';
import { createCategoryMapService } from './services/category-map.service.js';
import { createForecastsService } from './services/forecasts.service.js';
import { registerQuotasRoutes } from './routes/quotas.routes.js';
import { registerQuotaRoutes } from './routes/quota.routes.js';
import { registerForecastsRoutes } from './routes/forecasts.routes.js';
import { registerForecastOverrideRoutes } from './routes/forecast-override.routes.js';
import { registerForecastRollupRoutes } from './routes/forecast-rollup.routes.js';
import { registerForecastRoutes } from './routes/forecast.routes.js';
import { registerForecastHierarchyRoutes } from './routes/forecast-hierarchy.routes.js';
import { registerForecastEntryRoutes } from './routes/forecast-entry.routes.js';
import { createForecastRollupService } from './services/forecast-rollup.service.js';
import { createForecastHierarchyService } from './services/forecast-hierarchy.service.js';
import { createForecastEntryService } from './services/forecast-entry.service.js';
import { startDealForecastConsumer } from './consumers/deal-forecast.consumer.js';
import { startForecastSnapshotPoller } from './lib/forecast-snapshot.poller.js';
import { registerGraphQL } from './graphql/index.js';

startTracing({ serviceName: 'planning-service' });
const port = parseInt(process.env.PORT ?? '3020', 10);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}

const app = await createService({
  name: 'planning-service',
  port,
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
});

const prisma = getPrisma();
const producer = new NexusProducer('planning-service');

await app.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: '1 minute',
  errorResponseBuilder: (_req: any, context: any) => ({
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

registerHealthRoutes(app, 'planning-service', [() => checkDatabase(prisma as any)]);
app.setErrorHandler(globalErrorHandler);

await producer.connect().catch(() => undefined);

app.addHook('onClose', async () => {
  try { await producer.disconnect(); } catch { /* ignore */ }
});

await registerGraphQL(app, prisma);

// ─── Deal-event forecast roll-up consumer (best-effort) ────────────────────
// Maintains ForecastAggregate per owner/period from deal.* events. Guarded so a
// missing/broken Kafka never prevents the service from booting or serving HTTP.
let dealForecastConsumer: Awaited<ReturnType<typeof startDealForecastConsumer>> | null = null;
try {
  dealForecastConsumer = await startDealForecastConsumer(prisma, app.log as any);
} catch (err) {
  app.log.error({ err }, 'planning-service: failed to start deal-forecast consumer (continuing without it)');
}

app.addHook('onClose', async () => {
  try { if (dealForecastConsumer) await dealForecastConsumer.disconnect(); } catch { /* ignore */ }
});

// ─── Daily forecast-snapshot poller (best-effort) ──────────────────────────
// Captures point-in-time ForecastSnapshot rows for trend charting. Fail-open;
// never blocks boot.
let snapshotPoller: { stop: () => void } | null = null;
try {
  snapshotPoller = startForecastSnapshotPoller(prisma, app.log as any);
} catch (err) {
  app.log.error({ err }, 'planning-service: failed to start forecast-snapshot poller (continuing without it)');
}
app.addHook('onClose', async () => {
  try { if (snapshotPoller) snapshotPoller.stop(); } catch { /* ignore */ }
});

await startService(app, port, async () => {
  const categoryMapService = createCategoryMapService(prisma);
  const rollupService = createForecastRollupService(prisma, { categoryResolver: categoryMapService });
  await registerQuotasRoutes(app, createQuotasService(prisma));
  await registerQuotaRoutes(app, createQuotaService(prisma));
  await registerForecastsRoutes(app, createForecastsService(prisma, producer));
  await registerForecastOverrideRoutes(app, prisma);
  await registerForecastRollupRoutes(app, rollupService);
  await registerForecastRoutes(app, rollupService, categoryMapService);
  await registerForecastHierarchyRoutes(app, createForecastHierarchyService(prisma));
  await registerForecastEntryRoutes(app, createForecastEntryService(prisma));
});
