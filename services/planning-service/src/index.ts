import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { NexusProducer } from '@nexus/kafka';
import { globalErrorHandler, startService } from '@nexus/service-utils';
import { getPrisma } from './prisma.js';
import { createQuotasService } from './services/quotas.service.js';
import { createForecastsService } from './services/forecasts.service.js';
import { registerQuotasRoutes } from './routes/quotas.routes.js';
import { registerForecastsRoutes } from './routes/forecasts.routes.js';

const app = Fastify({ logger: true });
const prisma = getPrisma();
const producer = new NexusProducer('planning-service');

await app.register(fastifyJwt, {
  secret: process.env.JWT_SECRET ?? 'nexus-development-secret-at-least-32',
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

app.addHook('onRequest', async (request, reply) => {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ success: false, error: 'Unauthorized' });
  }
});

await producer.connect().catch(() => undefined);
await registerQuotasRoutes(app, createQuotasService(prisma, producer));
await registerForecastsRoutes(app, createForecastsService(prisma, producer));

app.addHook('onClose', async () => {
  try { await producer.disconnect(); } catch { /* ignore */ }
});

const port = parseInt(process.env.PORT ?? '3020', 10);
await startService(app, port, async () => {
  await prisma.$disconnect();
});