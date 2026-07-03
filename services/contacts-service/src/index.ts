import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import { createService, startService } from '@nexus/service-utils';
import { NexusProducer } from '@nexus/kafka';
import { createContactsPrisma, tenantAls } from './prisma.js';
import { registerContactsHealthRoutes } from './routes/health.routes.js';
import { registerContactsRoutes } from './routes/contacts.routes.js';
import { registerAccountsRoutes } from './routes/accounts.routes.js';
import { registerCompaniesRoutes } from './routes/companies.routes.js';
import { registerGraphQL } from './graphql/index.js';
// REMOVED: Self-consuming sync consumer (anti-pattern). A service must not consume
// its own events to update its own database — the write path already does that.
// If read-models are needed, use a dedicated consumer service (e.g. search-service).

startTracing({ serviceName: 'contacts-service' });
const port = Number(process.env.PORT ?? 3041);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}

const app = await createService({ name: 'contacts-service', port, jwtSecret, corsOrigins: ['http://localhost:3000'] });

const prisma = createContactsPrisma();
const producer = new NexusProducer('contacts-service');

// Bridge Fastify request-context tenantId into Prisma tenant ALS (defense-in-depth)
app.addHook('preHandler', async (request) => {
  const tenantId = (request as any).requestContext?.get('tenantId');
  if (tenantId) tenantAls.enterWith({ tenantId });
});

// registerContactsHealthRoutes already registers GET /health (with DB checks)
// via registerHealthRoutes internally — do not register it again here.
registerContactsHealthRoutes(app, prisma);

try {
  await producer.connect();
  app.log.info('Kafka producer connected');
} catch (err) {
  app.log.warn({ err }, 'Kafka producer connect failed; continuing without event publishing');
}

app.addHook('onClose', async () => {
  try { await producer.disconnect(); } catch { /* ignore */ }
});

await registerContactsRoutes(app, prisma, producer);
await registerAccountsRoutes(app, prisma, producer);
await registerCompaniesRoutes(app, prisma);
await registerGraphQL(app, prisma);

await startService(app, port, async () => {
  await (prisma as any).$disconnect();
});
