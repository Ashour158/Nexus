import 'dotenv/config';
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
import { startAnalyticsConsumer } from './consumers/events.consumer.js';

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
registerHealthRoutes(app, 'analytics-service', []);

const clickhouse = createClickHouseClient();
try {
  await startAnalyticsConsumer(clickhouse);
  app.log.info('Analytics consumer started');
} catch (err) {
  app.log.warn({ err }, 'Analytics consumer failed to start; continuing in HTTP-only mode');
}

await startService(app, port, async (a) => {
  await registerPipelineAnalyticsRoutes(a, clickhouse);
  await registerRevenueAnalyticsRoutes(a, clickhouse);
  await registerActivityAnalyticsRoutes(a, clickhouse);
  await registerForecastAnalyticsRoutes(a, clickhouse);
});