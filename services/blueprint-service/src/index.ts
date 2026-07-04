import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import rateLimit from '@fastify/rate-limit';
import {
  checkDatabase,
  createService,
  globalErrorHandler,
  registerHealthRoutes,
  startService,
} from '@nexus/service-utils';
import { NexusProducer } from '@nexus/kafka';
import { PrismaClient } from '../../../node_modules/.prisma/blueprint-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';
import { createBlueprintPrisma } from './prisma.js';
import { createPlaybooksService } from './services/playbooks.service.js';
import { createTemplatesService } from './services/templates.service.js';
import { createValidationService } from './services/validation.service.js';
import { registerBlueprintInternalRoutes } from './routes/internal.routes.js';
import { registerPlaybooksRoutes } from './routes/playbooks.routes.js';
import { registerTemplatesRoutes } from './routes/templates.routes.js';
import { registerValidationRoutes } from './routes/validation.routes.js';
import { registerGraphQL } from './graphql/index.js';
import { startDealStageConsumer } from './consumers/deal-stage.consumer.js';

startTracing({ serviceName: 'blueprint-service' });
const rawPrisma = new PrismaClient({
  datasources: {
    db: {
      url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10 }),
    },
  },
});
const prisma = createBlueprintPrisma(rawPrisma);
const producer = new NexusProducer('blueprint-service');

const port = Number(process.env.PORT ?? 3013);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}

const app = await createService({
  name: 'blueprint-service',
  port,
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3100')
    .split(',')
    .map((s) => s.trim()),
});
await app.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: '1 minute',
  errorResponseBuilder: (_req, context) => ({
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: `Too many requests. Retry after ${context.after}.`,
  }),
});

registerHealthRoutes(app, 'blueprint-service', [() => checkDatabase(rawPrisma)]);
app.setErrorHandler(globalErrorHandler);

try {
  await producer.connect();
} catch (err) {
  app.log.warn({ err }, 'Kafka producer connect failed');
}

// Deal stage-change consumer: executes playbook stage entryActions on
// `deal.stage_changed`. Guarded so a Kafka/DB outage never stops the service
// from booting or serving HTTP.
let dealStageConsumer: Awaited<ReturnType<typeof startDealStageConsumer>> | null = null;
try {
  dealStageConsumer = await startDealStageConsumer(prisma, producer, app.log);
  app.log.info('Deal stage consumer started (playbook entry actions)');
} catch (err) {
  app.log.warn({ err }, 'Deal stage consumer failed to start; continuing without stage-entry actions');
}

app.addHook('onClose', async () => {
  try {
    await producer.disconnect();
  } catch {
    /* ignore */
  }
  try {
    await dealStageConsumer?.disconnect();
  } catch {
    /* ignore */
  }
  await rawPrisma.$disconnect();
});

const playbooks = createPlaybooksService(prisma, producer);
const templates = createTemplatesService(prisma);
const validation = createValidationService(prisma);

await registerGraphQL(app, prisma);

await startService(app, port, async (a) => {
  await registerBlueprintInternalRoutes(a, validation);
  await registerPlaybooksRoutes(a, playbooks);
  await registerTemplatesRoutes(a, templates);
  await registerValidationRoutes(a, validation);
});