import { runCrossTenant } from '@nexus/service-utils/prisma-tenant';
import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import {
  createService,
  startService,
  globalErrorHandler,
  registerHealthRoutes,
  checkDatabase,
} from '@nexus/service-utils';
import rateLimit from '@fastify/rate-limit';
import { NexusProducer } from '@nexus/kafka';
import { getPrisma, getRawPrisma, tenantAls } from './prisma.js';
import { createTicketsService } from './services/tickets.service.js';
import { registerTicketRoutes } from './routes/tickets.routes.js';
import { registerSlaRoutes } from './routes/sla.routes.js';
import { registerEntitlementRoutes } from './routes/entitlements.routes.js';
import { registerInternalPortalRoutes } from './routes/internal-portal.routes.js';

startTracing({ serviceName: 'ticket-service' });
const port = parseInt(process.env.PORT ?? '3029', 10);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}

const app = await createService({
  name: 'ticket-service',
  port,
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
});

const prisma = getPrisma();
// Raw (non-tenant-extended) client for the cross-tenant SLA breach sweep.
const rawPrisma = getRawPrisma() as unknown as typeof prisma;
const producer = new NexusProducer('ticket-service');
const tickets = createTicketsService(prisma, producer, rawPrisma);

// Bridge Fastify request-context tenantId into Prisma tenant ALS (defense-in-depth).
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

registerHealthRoutes(app, 'ticket-service', [() => checkDatabase(prisma as any)]);
app.setErrorHandler(globalErrorHandler);

await registerTicketRoutes(app, tickets);
await registerSlaRoutes(app, tickets);
await registerEntitlementRoutes(app, tickets);
await registerInternalPortalRoutes(app, prisma, tickets);

// Kafka producer is best-effort: if the broker is down we keep serving requests.
try {
  await producer.connect();
  app.log.info('Kafka producer connected');
} catch (err) {
  app.log.warn({ err }, 'Kafka producer connect failed; continuing without event publishing');
}

// SLA breach poller — evaluates due dates and emits `ticket.sla.breached`.
// Cross-tenant scan (no request context), guarded so a slow run never overlaps.
const SLA_POLL_MS = parseInt(process.env.SLA_POLL_INTERVAL_MS ?? '60000', 10);
let slaRunning = false;
const slaTimer = setInterval(async () => {
  if (slaRunning) return;
  slaRunning = true;
  try {
    const flagged = await runCrossTenant('ticket SLA breach scan spans all tenants', () => tickets.evaluateSlaBreaches());
    if (flagged > 0) app.log.info({ flagged }, 'SLA breach poller flagged tickets');
  } catch (err) {
    app.log.warn({ err }, 'SLA breach poller error');
  } finally {
    slaRunning = false;
  }
}, SLA_POLL_MS);
slaTimer.unref?.();

app.addHook('onClose', async () => {
  clearInterval(slaTimer);
  try {
    await producer.disconnect();
  } catch {
    /* ignore */
  }
});

await startService(app, port, async () => {});
