import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import { createService, startService } from '@nexus/service-utils';
import rateLimit from '@fastify/rate-limit';
import { NexusProducer } from '@nexus/kafka';
import { createActivitiesPrisma, tenantAls } from './prisma.js';
import { registerActivitiesHealthRoutes } from './routes/health.routes.js';
import { registerActivitiesRoutes } from './routes/activities.routes.js';
import { registerTasksRoutes } from './routes/tasks.routes.js';
import { registerMeetingsRoutes } from './routes/meetings.routes.js';
import { startRemindersPoller } from './lib/reminders.poller.js';
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

// Bridge Fastify request-context tenantId into Prisma tenant ALS (defense-in-depth)
app.addHook('preHandler', async (request) => {
  const tenantId = (request as any).requestContext?.get('tenantId');
  if (tenantId) tenantAls.enterWith({ tenantId });
});

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

// Due-date reminder + overdue/SLA poller. Additive and fail-open: a failed start
// or any tick never breaks request handling.
let remindersPoller: { stop(): void } | undefined;
try {
  remindersPoller = startRemindersPoller(prisma, producer);
  app.log.info('Reminders/overdue poller started');
} catch (err) {
  app.log.warn({ err }, 'Reminders/overdue poller failed to start; continuing');
}

app.addHook('onClose', async () => {
  try { remindersPoller?.stop(); } catch (err) { app.log.warn({ err }, 'Reminders poller stop failed'); }
  try { await producer.disconnect(); } catch (err) { app.log.warn({ err }, 'Producer disconnect failed'); }
});

await startService(app, port, async () => {
  await registerActivitiesRoutes(app, prisma, producer);
  await registerTasksRoutes(app, prisma);
  await registerMeetingsRoutes(app, prisma);
});
