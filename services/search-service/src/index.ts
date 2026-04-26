import 'dotenv/config';
import rateLimit from '@fastify/rate-limit';
import { createService, globalErrorHandler, registerHealthRoutes, startService } from '@nexus/service-utils';
import { createMeilisearchClient } from './meilisearch.js';
import { setupIndexes } from './indexes/setup.js';
import { startIndexerConsumer } from './consumers/indexer.consumer.js';
import { registerSearchRoutes } from './routes/search.routes.js';

const port = Number(process.env.PORT ?? 3006);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters (Section 26).');
}

const app = await createService({
  name: 'search-service',
  port,
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim()),
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
registerHealthRoutes(app, 'search-service', []);

const meili = createMeilisearchClient();

try {
  await setupIndexes(meili);
  app.log.info('Meilisearch indexes ready');
} catch (err) {
  app.log.warn({ err }, 'Meilisearch setup failed; search may be degraded');
}

try {
  await startIndexerConsumer(meili);
  app.log.info('Search indexer consumer started');
} catch (err) {
  app.log.warn({ err }, 'Indexer consumer failed; real-time indexing disabled');
}

await startService(app, port, async (a) => {
  await registerSearchRoutes(a, meili);
});