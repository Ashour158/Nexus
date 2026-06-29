import { startTracing } from '@nexus/service-utils/tracing';
import { createService, startService, globalErrorHandler } from '@nexus/service-utils';
import { NexusConsumer, NexusProducer, TOPICS } from '@nexus/kafka';
import { getPrisma } from './prisma.js';
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
const consumer = new NexusConsumer('territory-service-leads');
const territories = createTerritoriesService(prisma, producer);

app.setErrorHandler(globalErrorHandler);

await registerTerritoriesRoutes(app, territories);
await registerTerritoryInternalRoutes(app, territories);
await producer.connect().catch(() => undefined);
await consumer.subscribe([TOPICS.LEADS]).catch(() => undefined);
consumer.on('lead.created', async (event) => {
  const lead = event.payload as Record<string, unknown>;
  const assigned = await territories.assignLead(event.tenantId, lead);
  if (assigned?.assignedOwnerId) {
    try {
      const res = await fetch(`${process.env.CRM_SERVICE_URL}/api/v1/internal/leads/${String(lead.id)}/owner`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-service-token': process.env.INTERNAL_SERVICE_TOKEN ?? '',
          'x-tenant-id': event.tenantId,
        },
        body: JSON.stringify({ ownerId: assigned.assignedOwnerId, territoryId: assigned.territory?.id }),
      });
      if (!res.ok) {
        console.error(`[TerritoryConsumer] Failed to update lead owner: ${res.status} ${await res.text().catch(() => '')}`);
      }
    } catch (err: any) {
      console.error('[TerritoryConsumer] Error updating lead owner:', err.message);
    }
  }
});

await consumer.start().catch(() => undefined);

app.addHook('onClose', async () => {
  try { await producer.disconnect(); } catch { /* ignore */ }
  try { await consumer.disconnect(); } catch { /* ignore */ }
});

await registerGraphQL(app, prisma);

await startService(app, port, async () => {});
