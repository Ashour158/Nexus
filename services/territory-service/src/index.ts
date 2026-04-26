import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { NexusConsumer, NexusProducer, TOPICS } from '@nexus/kafka';
import { globalErrorHandler, startService } from '@nexus/service-utils';
import { getPrisma } from './prisma.js';
import { createTerritoriesService } from './services/territories.service.js';
import { registerTerritoriesRoutes } from './routes/territories.routes.js';

const app = Fastify({ logger: true });
const prisma = getPrisma();
const producer = new NexusProducer('territory-service');
const consumer = new NexusConsumer('territory-service-leads');
const territories = createTerritoriesService(prisma, producer);

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

await registerTerritoriesRoutes(app, territories);
await producer.connect().catch(() => undefined);
await consumer.subscribe([TOPICS.LEADS]).catch(() => undefined);
consumer.on('lead.created', async (event) => {
  const lead = event.payload as Record<string, unknown>;
  const assigned = await territories.assignLead(event.tenantId, lead);
  if (assigned?.assignedOwnerId) {
    await fetch(`${process.env.CRM_SERVICE_URL}/api/v1/leads/${String(lead.id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}`,
      },
      body: JSON.stringify({ ownerId: assigned.assignedOwnerId }),
      }),
    });
  }
});

await consumer.start().catch(() => undefined);

app.addHook('onClose', async () => {
  try { await producer.disconnect(); } catch { /* ignore */ }
  try { await consumer.stop(); } catch { /* ignore */ }
});

const port = parseInt(process.env.PORT ?? '3019', 10);
await startService(app, port, async () => {
  await prisma.$disconnect();
});