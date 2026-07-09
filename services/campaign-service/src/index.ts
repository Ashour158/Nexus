import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import { createService, startService, globalErrorHandler, registerHealthRoutes, checkDatabase } from '@nexus/service-utils';
import rateLimit from '@fastify/rate-limit';
import { NexusConsumer, NexusProducer, TOPICS } from '@nexus/kafka';
import { getPrisma, tenantAls } from './prisma.js';
import { createCampaignsService } from './services/campaigns.service.js';
import { createMembersService } from './services/members.service.js';
import { createMetricsService } from './services/metrics.service.js';
import { createEngagementService } from './services/engagement.service.js';
import { registerCampaignsRoutes } from './routes/campaigns.routes.js';
import { registerMembersRoutes } from './routes/members.routes.js';
import { registerMetricsRoutes } from './routes/metrics.routes.js';

startTracing({ serviceName: 'campaign-service' });
const port = parseInt(process.env.PORT ?? '3025', 10);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}

const app = await createService({
  name: 'campaign-service',
  port,
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
});

const prisma = getPrisma();
const producer = new NexusProducer('campaign-service');
const consumer = new NexusConsumer('campaign-service-events');

const campaigns = createCampaignsService(prisma, producer);
const members = createMembersService(prisma, producer);
const metrics = createMetricsService(prisma);
const engagement = createEngagementService(prisma);

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

// Bridge Fastify request-context tenantId into Prisma tenant ALS
app.addHook('preHandler', async (request) => {
  const tenantId = (request as any).requestContext?.get('tenantId');
  if (tenantId) tenantAls.enterWith({ tenantId });
});

registerHealthRoutes(app, 'campaign-service', [() => checkDatabase(prisma as any)]);
app.setErrorHandler(globalErrorHandler);

await producer.connect().catch(() => undefined);
await consumer.subscribe([TOPICS.EMAILS, TOPICS.DEALS]).catch(() => undefined);

// Inbound email engagement → CampaignMember status + timestamps.
for (const t of ['email.sent', 'email.opened', 'email.clicked', 'email.bounced', 'email.unsubscribed'] as const) {
  consumer.on(t, (event) => engagement.handleEmailEvent(t, event as any));
}
// Deal attribution → mark member CONVERTED + stamp convertedDealId.
for (const t of ['deal.created', 'deal.won', 'deal.updated'] as const) {
  consumer.on(t, (event) => engagement.handleDealEvent(t, event as any));
}
await consumer.start().catch(() => undefined);

app.addHook('onClose', async () => {
  try { await producer.disconnect(); } catch { /* ignore */ }
  try { await consumer.disconnect(); } catch { /* ignore */ }
});

await startService(app, port, async () => {
  await registerCampaignsRoutes(app, campaigns);
  await registerMembersRoutes(app, members);
  await registerMetricsRoutes(app, metrics);
});
