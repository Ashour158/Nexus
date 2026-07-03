import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import { createService, startService } from '@nexus/service-utils';
import { NexusProducer } from '@nexus/kafka';
import { createMetadataPrisma, tenantAls } from './prisma.js';
import { registerMetadataHealthRoutes } from './routes/health.routes.js';
import { registerCustomFieldsRoutes } from './routes/custom-fields.routes.js';
import { registerTagsRoutes } from './routes/tags.routes.js';
import { registerValidationRulesRoutes } from './routes/validation-rules.routes.js';
import { registerCodingRoutes } from './routes/coding.routes.js';
import { registerGraphQL } from './graphql/index.js';
// REMOVED: Self-consuming sync consumer (anti-pattern). A service must not consume
// its own events to update its own database — the write path already does that.
// If read-models are needed, use a dedicated consumer service (e.g. search-service).

startTracing({ serviceName: 'metadata-service' });
const port = Number(process.env.PORT ?? 3004);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}

const app = await createService({ name: 'metadata-service', port, jwtSecret, corsOrigins: ['http://localhost:3000'] });

const prisma = createMetadataPrisma();
const producer = new NexusProducer('metadata-service');

// Bridge Fastify request-context tenantId into Prisma tenant ALS (defense-in-depth)
app.addHook('preHandler', async (request) => {
  const tenantId = (request as any).requestContext?.get('tenantId');
  if (tenantId) tenantAls.enterWith({ tenantId });
});

// registerMetadataHealthRoutes already registers GET /health (with DB checks)
// via registerHealthRoutes internally — do not register it again here.
registerMetadataHealthRoutes(app, prisma);

try {
  await producer.connect();
  app.log.info('Kafka producer connected');
} catch (err) {
  app.log.warn({ err }, 'Kafka producer connect failed; continuing without event publishing');
}

app.addHook('onClose', async () => {
  try { await producer.disconnect(); } catch (err) { app.log.warn({ err }, 'Producer disconnect failed'); }
});

await registerGraphQL(app, prisma);

await startService(app, port, async () => {
  await registerCustomFieldsRoutes(app, prisma);
  await registerTagsRoutes(app, prisma);
  await registerValidationRulesRoutes(app, prisma);
  await registerCodingRoutes(app, prisma);
});
