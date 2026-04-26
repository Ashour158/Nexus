import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { globalErrorHandler, startService } from '@nexus/service-utils';
import { registerDocumentsRoutes } from './routes/documents.routes.js';

const app = Fastify({ logger: true });
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

await registerDocumentsRoutes(app);

const port = parseInt(process.env.PORT ?? '3016', 10);
await startService(app, port, async () => { /* no prisma in this service */ });