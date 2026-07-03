import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import { createService, startService, globalErrorHandler, registerHealthRoutes, checkDatabase } from '@nexus/service-utils';
import rateLimit from '@fastify/rate-limit';
import { NexusProducer } from '@nexus/kafka';
import { getPrisma, tenantAls } from './prisma.js';
import { createQuotasService } from './services/quotas.service.js';
import { createForecastsService } from './services/forecasts.service.js';
import { registerQuotasRoutes } from './routes/quotas.routes.js';
import { registerForecastsRoutes } from './routes/forecasts.routes.js';
import { registerForecastOverrideRoutes } from './routes/forecast-override.routes.js';
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

await startService(app, port, async () => {
  await registerQuotasRoutes(app, createQuotasService(prisma));
  await registerForecastsRoutes(app, createForecastsService(prisma, producer));
  await registerForecastOverrideRoutes(app, prisma);
});
