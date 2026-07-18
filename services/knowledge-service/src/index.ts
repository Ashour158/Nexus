import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import { createService, startService, globalErrorHandler, registerHealthRoutes, checkDatabase } from '@nexus/service-utils';
import { NexusProducer } from '@nexus/kafka';
import { getPrisma } from './prisma.js';
import { createKnowledgeService } from './services/knowledge.service.js';
import { registerRoutes } from './routes/index.js';
import { registerGraphQL } from './graphql/index.js';

startTracing({ serviceName: 'knowledge-service' });
const port = parseInt(process.env.PORT ?? '3023', 10);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}

const app = await createService({
  name: 'knowledge-service',
  port,
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
});

const prisma = getPrisma();

app.setErrorHandler(globalErrorHandler);
registerHealthRoutes(app, 'knowledge-service', [() => checkDatabase(prisma)]);

// Kafka producer for search-index events. Fail-open: if the broker is down we
// continue serving requests; article events are fire-and-forget best-effort.
const producer = new NexusProducer('knowledge-service');
try {
  await producer.connect();
  app.log.info('Kafka producer connected');
} catch (err) {
  app.log.warn({ err }, 'Kafka producer connect failed; continuing without event publishing');
}
app.addHook('onClose', async () => {
  try { await producer.disconnect(); } catch (err) { app.log.warn({ err }, 'Producer disconnect failed'); }
});

const knowledgeSvc = createKnowledgeService(prisma, producer);

await registerGraphQL(app, prisma);

await startService(app, port, async () => {
  await registerRoutes(app, knowledgeSvc, prisma);
});
