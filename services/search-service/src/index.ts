import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import rateLimit from '@fastify/rate-limit';
import { createService, globalErrorHandler, registerHealthRoutes, startService, type HealthCheck } from '@nexus/service-utils';
import { createMeilisearchClient } from './meilisearch.js';
import { setupIndexes } from './indexes/setup.js';
import { startIndexerConsumer } from './consumers/indexer.consumer.js';
import { registerSearchRoutes } from './routes/search.routes.js';
import { registerSavedSearchRoutes } from './routes/saved-search.routes.js';
import { createSearchPrisma } from './prisma.js';
import { registerGraphQL } from './graphql/index.js';

startTracing({ serviceName: 'search-service' });
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
const meili = createMeilisearchClient();
// Backs saved searches (SRCH-08) + recent-search history (SRCH-09).
const prisma = createSearchPrisma();

registerHealthRoutes(app, 'search-service', [
  async (): Promise<HealthCheck> => {
    const start = Date.now();
    try {
      const health = await meili.health();
      if (health.status !== 'available') {
        return {
          name: 'meilisearch',
          ok: false,
          latencyMs: Date.now() - start,
          message: `Meilisearch status: ${health.status}`,
        };
      }
      return { name: 'meilisearch', ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return {
        name: 'meilisearch',
        ok: false,
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },
]);

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

await registerGraphQL(app);

await startService(app, port, async (a) => {
  await registerSearchRoutes(a, meili, prisma);
  await registerSavedSearchRoutes(a, prisma);
});
