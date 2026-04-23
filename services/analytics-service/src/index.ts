import 'dotenv/config';
import { createService, globalErrorHandler, registerHealthRoutes, startService } from '@nexus/service-utils';
import { createClickHouseClient } from './clickhouse.js';
import { registerPipelineAnalyticsRoutes } from './routes/pipeline.routes.js';
import { registerRevenueAnalyticsRoutes } from './routes/revenue.routes.js';
import { registerActivityAnalyticsRoutes } from './routes/activity.routes.js';
import { registerForecastAnalyticsRoutes } from './routes/forecast.routes.js';
import { startAnalyticsConsumer } from './consumers/events.consumer.js';

const port = Number(process.env.PORT ?? 3008);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters (Section 26).');
}

const app = await createService({
  name: 'analytics-service',
  port,
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim()),
});
app.setErrorHandler(globalErrorHandler);
registerHealthRoutes(app, 'analytics-service', []);

const clickhouse = createClickHouseClient();
try {
  await startAnalyticsConsumer(clickhouse);
  app.log.info('Analytics consumer started');
} catch (err) {
  app.log.warn({ err }, 'Analytics consumer failed to start');
}

await startService(app, port, async (a) => {
  await registerPipelineAnalyticsRoutes(a, clickhouse);
  await registerRevenueAnalyticsRoutes(a, clickhouse);
  await registerActivityAnalyticsRoutes(a, clickhouse);
  await registerForecastAnalyticsRoutes(a, clickhouse);
});
