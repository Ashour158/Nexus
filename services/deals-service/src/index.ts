import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import { createService, startService } from '@nexus/service-utils';
import { NexusProducer } from '@nexus/kafka';
import { createDealsPrisma } from './prisma.js';
import { registerDealsHealthRoutes } from './routes/health.routes.js';
import { registerDealsRoutes } from './routes/deals.routes.js';
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

await startService(app, port, async () => {
  await (prisma as any).$disconnect();
});
