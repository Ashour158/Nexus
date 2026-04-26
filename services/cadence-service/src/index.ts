import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { NexusConsumer, NexusProducer, TOPICS } from '@nexus/kafka';
import { globalErrorHandler, startService } from '@nexus/service-utils';
import { getPrisma } from './prisma.js';
import { createCadencesService } from './services/cadences.service.js';
import { createEnrollmentsService } from './services/enrollments.service.js';
import { createQueueService } from './services/queue.service.js';
import { registerCadencesRoutes } from './routes/cadences.routes.js';
import { registerEnrollmentsRoutes } from './routes/enrollments.routes.js';

const app = Fastify({ logger: true });
const prisma = getPrisma();
const producer = new NexusProducer('cadence-service');
const consumer = new NexusConsumer('cadence-service-events');

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

const cadences = createCadencesService(prisma);
const enrollments = createEnrollmentsService(prisma, producer);
const queue = createQueueService(prisma, producer);
await registerCadencesRoutes(app, cadences);
await registerEnrollmentsRoutes(app, enrollments);

await producer.connect().catch(() => undefined);
await consumer.subscribe([TOPICS.ACTIVITIES]).catch(() => undefined);
consumer.on('activity.completed', async (event) => {
  const payload = event.payload as { type?: string; contactId?: string };
  if (payload.type !== 'MEETING' || !payload.contactId) return;
  const rows = await prisma.cadenceEnrollment.findMany({
    where: { tenantId: event.tenantId, status: 'ACTIVE', objectId: payload.contactId },
  });
  await Promise.all(
    rows.map((r) => enrollments.exitEnrollment(event.tenantId, r.id, 'meeting_booked'))
  );
});
await consumer.start().catch(() => undefined);

app.addHook('onClose', async () => {
  try { await producer.disconnect(); } catch { /* ignore */ }
  try { await consumer.stop(); } catch { /* ignore */ }
});

const port = parseInt(process.env.PORT ?? '3018', 10);
await startService(app, port, async () => {
  await prisma.$disconnect();
});