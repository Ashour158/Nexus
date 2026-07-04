import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import { createService, startService } from '@nexus/service-utils';
import { NexusProducer } from '@nexus/kafka';
import { createDealsPrisma, tenantAls } from './prisma.js';
import { registerDealsHealthRoutes } from './routes/health.routes.js';
import { registerDealsRoutes } from './routes/deals.routes.js';
import { createDealsService } from './services/deals.service.js';
import { registerPipelinesRoutes } from './routes/pipelines.routes.js';
import { registerQuotesRoutes } from './routes/quotes.routes.js';
import { registerQuoteProjectionRoutes } from './routes/quote-projections.routes.js';
import { registerGraphQL } from './graphql/index.js';
import { startQuoteProjectionConsumer } from './consumers/quote-projection.consumer.js';
// REMOVED: Self-consuming sync consumer (anti-pattern). A service must not consume
// its own events to update its own database — the write path already does that.
// If read-models are needed, use a dedicated consumer service (e.g. search-service).

startTracing({ serviceName: 'deals-service' });
const port = Number(process.env.PORT ?? 3042);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}

const app = await createService({ name: 'deals-service', port, jwtSecret, corsOrigins: ['http://localhost:3000'] });

const prisma = createDealsPrisma();
const producer = new NexusProducer('deals-service');

// Bridge Fastify request-context tenantId into Prisma tenant ALS (defense-in-depth)
app.addHook('preHandler', async (request) => {
  const tenantId = (request as any).requestContext?.get('tenantId');
  if (tenantId) tenantAls.enterWith({ tenantId });
});

// registerDealsHealthRoutes already registers GET /health (with DB + producer
// checks) via registerHealthRoutes internally — do not register it again here.
registerDealsHealthRoutes(app, prisma, producer);

try {
  await producer.connect();
  app.log.info('Kafka producer connected');
} catch (err) {
  app.log.warn({ err }, 'Kafka producer connect failed; continuing without event publishing');
}

app.addHook('onClose', async () => {
  try { await producer.disconnect(); } catch { /* ignore */ }
});

await registerDealsRoutes(app, prisma, producer);
await registerPipelinesRoutes(app, prisma);
await registerQuotesRoutes(app, prisma);
await registerQuoteProjectionRoutes(app, prisma);
await registerGraphQL(app, prisma);

try {
  await startQuoteProjectionConsumer(prisma);
  app.log.info('Quote projection consumer started');
} catch (err) {
  app.log.warn({ err }, 'Quote projection consumer failed to start; continuing without projection updates');
}

// ─── Rotten-deal poller ──────────────────────────────────────────────────────
// Guarded, unref'd setInterval that finds OPEN deals idle past their stage's
// rottenDays and emits `deal.rotten`. Disabled by default via env; each pass is
// wrapped in try/catch so a transient DB/Kafka outage never crashes the service.
const rottenScanEnabled = process.env.DEALS_ROTTEN_SCAN_ENABLED !== 'false';
const rottenScanIntervalMs = Math.max(60_000, Number(process.env.DEALS_ROTTEN_SCAN_INTERVAL_MS ?? 3_600_000));
if (rottenScanEnabled) {
  const rottenScanService = createDealsService(prisma, producer);
  const rottenTimer = setInterval(() => {
    void (async () => {
      try {
        const result = await rottenScanService.scanRottenDeals();
        if (result.rotten > 0) app.log.info(result, 'Rotten-deal scan emitted deal.rotten events');
      } catch (err) {
        app.log.warn({ err }, 'Rotten-deal scan failed; will retry next interval');
      }
    })();
  }, rottenScanIntervalMs);
  if (typeof rottenTimer.unref === 'function') rottenTimer.unref();
  app.addHook('onClose', async () => { clearInterval(rottenTimer); });
  app.log.info({ intervalMs: rottenScanIntervalMs }, 'Rotten-deal poller started');
}

await startService(app, port, async () => {
  await (prisma as any).$disconnect();
});
