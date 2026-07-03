import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import rateLimit from '@fastify/rate-limit';
import {
  createService,
  globalErrorHandler,
  optionalEnv,
  registerHealthRoutes,
  requireEnv,
  startService,
} from '@nexus/service-utils';
import { createClickHouseClient } from './clickhouse.js';
import { registerPipelineAnalyticsRoutes } from './routes/pipeline.routes.js';
import { registerRevenueAnalyticsRoutes } from './routes/revenue.routes.js';
import { registerActivityAnalyticsRoutes } from './routes/activity.routes.js';
import { registerForecastAnalyticsRoutes } from './routes/forecast.routes.js';
import { registerGraphQL } from './graphql/index.js';
import { startAnalyticsConsumer } from './consumers/events.consumer.js';
import { ensureCurrencyColumns } from './ddl/ensure-currency-columns.js';

startTracing({ serviceName: 'analytics-service' });
const env = requireEnv(['CLICKHOUSE_URL', 'JWT_SECRET']);
const port = Number(optionalEnv('PORT', '3008'));
const jwtSecret = env.JWT_SECRET;

const app = await createService({
  name: 'analytics-service',
  port,
  jwtSecret,
  corsOrigins: optionalEnv('CORS_ORIGINS', 'http://localhost:3000')
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
const clickhouse = createClickHouseClient();

registerHealthRoutes(app, 'analytics-service', [
  async () => {
    const start = Date.now();
    try {
      const result = await clickhouse.query({ query: 'SELECT 1', format: 'JSONEachRow' });
      await result.json();
      return { name: 'clickhouse', ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return { name: 'clickhouse', ok: false, latencyMs: Date.now() - start, message: (err as Error).message };
    }
  },
]);
try {
  await ensureCurrencyColumns(clickhouse);
  app.log.info('Analytics base-currency columns ensured');
} catch (err) {
  app.log.warn({ err }, 'ensureCurrencyColumns failed; continuing (projections fall back to 1:1)');
}
try {
  await startAnalyticsConsumer(clickhouse);
  app.log.info('Analytics consumer started');
} catch (err) {
  app.log.warn({ err }, 'Analytics consumer failed to start; continuing in HTTP-only mode');
}

await registerGraphQL(app);

await startService(app, port, async (a) => {
  await registerPipelineAnalyticsRoutes(a, clickhouse);
  await registerRevenueAnalyticsRoutes(a, clickhouse);
  await registerActivityAnalyticsRoutes(a, clickhouse);
  await registerForecastAnalyticsRoutes(a, clickhouse);
});