import { startTracing } from '@nexus/service-utils/tracing';
import { createService, startService, globalErrorHandler } from '@nexus/service-utils';
import { NexusConsumer, NexusProducer, TOPICS } from '@nexus/kafka';
import { getPrisma } from './prisma.js';
import { createCadencesService } from './services/cadences.service.js';
import { createEnrollmentsService } from './services/enrollments.service.js';
import { createQueueService } from './services/queue.service.js';
import { registerCadencesRoutes } from './routes/cadences.routes.js';
import { registerEnrollmentsRoutes } from './routes/enrollments.routes.js';
import { registerGraphQL } from './graphql/index.js';

startTracing({ serviceName: 'cadence-service' });
const port = parseInt(process.env.PORT ?? '3018', 10);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}

const app = await createService({
  name: 'cadence-service',
  port,
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
});

const prisma = getPrisma();
const producer = new NexusProducer('cadence-service');
const consumer = new NexusConsumer('cadence-service-events');

const cadences = createCadencesService(prisma);
const enrollments = createEnrollmentsService(prisma, producer);
const queue = createQueueService(prisma, producer);
const stopQueueWorker = queue.startQueueWorker();

app.setErrorHandler(globalErrorHandler);

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
  stopQueueWorker();
  try { await producer.disconnect(); } catch { /* ignore */ }
  try { await consumer.disconnect(); } catch { /* ignore */ }
});

await registerGraphQL(app, prisma);

await startService(app, port, async () => {
  await registerCadencesRoutes(app, cadences);
  await registerEnrollmentsRoutes(app, enrollments);
});
