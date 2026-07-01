import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import { createService, startService } from '@nexus/service-utils';
import rateLimit from '@fastify/rate-limit';
import { NexusProducer } from '@nexus/kafka';
import { createActivitiesPrisma } from './prisma.js';
import { registerActivitiesHealthRoutes } from './routes/health.routes.js';
import { registerActivitiesRoutes } from './routes/activities.routes.js';
import { registerTasksRoutes } from './routes/tasks.routes.js';
import { registerMeetingsRoutes } from './routes/meetings.routes.js';
// REMOVED: Self-consuming sync consumer (anti-pattern). A service must not consume
// its own events to update its own database — the write path already does that.
// If read-models are needed, use a dedicated consumer service (e.g. search-service).

startTracing({ serviceName: 'activities-service' });
const port = Number(process.env.PORT ?? 3043);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}

const app = await createService({ name: 'activities-service', port, jwtSecret, corsOrigins: ['http://localhost:3000'] });

const prisma = createActivitiesPrisma();
const producer = new NexusProducer('activities-service');

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

// registerActivitiesHealthRoutes already registers GET /health (with DB checks)
// via registerHealthRoutes internally — do not register it again here.
registerActivitiesHealthRoutes(app, prisma);

try {
  await producer.connect();
  app.log.info('Kafka producer connected');
} catch (err) {
  app.log.warn({ err }, 'Kafka producer connect failed; continuing without event publishing');
}

app.addHook('onClose', async () => {
  try { await producer.disconnect(); } catch (err) { app.log.warn({ err }, 'Producer disconnect failed'); }
});

await startService(app, port, async () => {
  await registerActivitiesRoutes(app, prisma, producer);
  await registerTasksRoutes(app, prisma);
  await registerMeetingsRoutes(app, prisma);
});
