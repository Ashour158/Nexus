import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import { createService, startService, globalErrorHandler, registerHealthRoutes, checkDatabase } from '@nexus/service-utils';
import rateLimit from '@fastify/rate-limit';
import { NexusConsumer, NexusProducer, TOPICS } from '@nexus/kafka';
import { getPrisma, tenantAls } from './prisma.js';
import { createTerritoriesService } from './services/territories.service.js';
import { registerTerritoriesRoutes } from './routes/territories.routes.js';
import { registerTerritoryInternalRoutes } from './routes/internal.routes.js';
import { registerGraphQL } from './graphql/index.js';

startTracing({ serviceName: 'territory-service' });
const port = parseInt(process.env.PORT ?? '3019', 10);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}

const app = await createService({
  name: 'territory-service',
  port,
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
});

const prisma = getPrisma();
const producer = new NexusProducer('territory-service');
const consumer = new NexusConsumer('territory-service-routing');
const territories = createTerritoriesService(prisma, producer);

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
registerHealthRoutes(app, 'territory-service', [() => checkDatabase(prisma as any)]);
app.setErrorHandler(globalErrorHandler);

await registerTerritoriesRoutes(app, territories);
await registerTerritoryInternalRoutes(app, territories);
await producer.connect().catch(() => undefined);
await consumer.subscribe([TOPICS.LEADS, TOPICS.ACCOUNTS]).catch(() => undefined);

// lead.created → evaluate territory rules, assign owner, call CRM back.
// Fail-open: any error is logged, never rethrown, so the consumer loop survives.
consumer.on('lead.created', async (event) => {
  try {
    const lead = event.payload as Record<string, unknown>;
    // leads-service emits `leadId`; internal route passes `id`. Support both.
    const leadId = String(lead.leadId ?? lead.id ?? '');
    if (!leadId) return;
    const assigned = await territories.assignRecord(event.tenantId, 'LEAD', leadId, { ...lead, id: leadId });
    if (assigned?.assignedOwnerId) {
      const res = await fetch(`${process.env.CRM_SERVICE_URL}/api/v1/internal/leads/${leadId}/owner`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-service-token': process.env.INTERNAL_SERVICE_TOKEN ?? '',
          'x-tenant-id': event.tenantId,
        },
        body: JSON.stringify({ ownerId: assigned.assignedOwnerId, territoryId: assigned.territory?.id }),
      });
      if (!res.ok) {
        console.warn(`[TerritoryConsumer] lead owner callback failed: ${res.status} ${await res.text().catch(() => '')}`);
      }
    }
  } catch (err: any) {
    console.warn('[TerritoryConsumer] lead.created handler error:', err?.message);
  }
});

// account.created → evaluate territory rules, assign owner, call CRM back.
// Mirrors the lead path: the routing ledger + account.routed event still fire
// inside assignRecord, and now the chosen owner is also written to the account
// via crm-service's internal account-owner endpoint. Fail-open.
consumer.on('account.created', async (event) => {
  try {
    const account = event.payload as Record<string, unknown>;
    const accountId = String(account.accountId ?? account.id ?? '');
    if (!accountId) return;
    const assigned = await territories.assignRecord(event.tenantId, 'ACCOUNT', accountId, { ...account, id: accountId });
    if (assigned?.assignedOwnerId) {
      const res = await fetch(`${process.env.CRM_SERVICE_URL}/api/v1/internal/accounts/${accountId}/owner`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-service-token': process.env.INTERNAL_SERVICE_TOKEN ?? '',
          'x-tenant-id': event.tenantId,
        },
        body: JSON.stringify({ ownerId: assigned.assignedOwnerId }),
      });
      if (!res.ok) {
        console.warn(`[TerritoryConsumer] account owner callback failed: ${res.status} ${await res.text().catch(() => '')}`);
      }
    }
  } catch (err: any) {
    console.warn('[TerritoryConsumer] account.created handler error:', err?.message);
  }
});

await consumer.start().catch(() => undefined);

app.addHook('onClose', async () => {
  try { await producer.disconnect(); } catch { /* ignore */ }
  try { await consumer.disconnect(); } catch { /* ignore */ }
});

await registerGraphQL(app, prisma);

await startService(app, port, async () => {});
