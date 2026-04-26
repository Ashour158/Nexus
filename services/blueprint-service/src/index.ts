import 'dotenv/config';
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
import { createBlueprintPrisma } from './prisma.js';
import { createPlaybooksService } from './services/playbooks.service.js';
import { createTemplatesService } from './services/templates.service.js';
import { createValidationService } from './services/validation.service.js';
import { registerBlueprintInternalRoutes } from './routes/internal.routes.js';
import { registerPlaybooksRoutes } from './routes/playbooks.routes.js';
import { registerTemplatesRoutes } from './routes/templates.routes.js';
import { registerValidationRoutes } from './routes/validation.routes.js';

const rawPrisma = new PrismaClient();
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

app.addHook('onClose', async () => {
  try {
    await producer.disconnect();
  } catch {
    /* ignore */
  }
  await rawPrisma.$disconnect();
});

const playbooks = createPlaybooksService(prisma, producer);
const templates = createTemplatesService(prisma, producer);
const validation = createValidationService(prisma);

await startService(app, port, async (a) => {
  await registerBlueprintInternalRoutes(a, prisma);
  await registerPlaybooksRoutes(a, playbooks);
  await registerTemplatesRoutes(a, templates);
  await registerValidationRoutes(a, validation);
});