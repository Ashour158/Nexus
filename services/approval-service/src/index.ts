import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { NexusProducer } from '@nexus/kafka';
import { globalErrorHandler, startService } from '@nexus/service-utils';
import { getPrisma } from './prisma.js';
import { registerPoliciesRoutes } from './routes/policies.routes.js';
import { registerRequestsRoutes } from './routes/requests.routes.js';

const app = Fastify({ logger: true });
const prisma = getPrisma();
const producer = new NexusProducer('approval-service');

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

await registerPoliciesRoutes(app, prisma, producer);
await registerRequestsRoutes(app, prisma, producer);

await producer.connect().catch(() => undefined);
app.addHook('onClose', async () => {
  try { await producer.disconnect(); } catch { /* ignore */ }
});

const port = parseInt(process.env.PORT ?? '3014', 10);
await startService(app, port, async () => {
  await prisma.$disconnect();
});