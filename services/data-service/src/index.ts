import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { NexusProducer } from '@nexus/kafka';
import { globalErrorHandler, startService } from '@nexus/service-utils';
import { getPrisma } from './prisma.js';
import { registerImportRoutes } from './routes/import.routes.js';
import { registerExportRoutes } from './routes/export.routes.js';
import { registerRecycleRoutes } from './routes/recycle.routes.js';
import { registerAuditRoutes } from './routes/audit.routes.js';
import { registerViewsRoutes } from './routes/views.routes.js';

const app = Fastify({ logger: true });
const prisma = getPrisma();
const producer = new NexusProducer('data-service');

await app.register(fastifyJwt, { secret: process.env.JWT_SECRET ?? 'nexus-secret' });
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

await registerImportRoutes(app, prisma, producer);
await registerExportRoutes(app, prisma);
await registerRecycleRoutes(app, prisma);
await registerAuditRoutes(app, prisma);
await registerViewsRoutes(app, prisma);

await producer.connect().catch(() => undefined);
app.addHook('onClose', async () => {
  try { await producer.disconnect(); } catch { /* ignore */ }
});

const port = parseInt(process.env.PORT ?? '3015', 10);
await startService(app, port, async () => {
  await prisma.$disconnect();
});