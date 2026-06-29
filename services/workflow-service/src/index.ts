import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import rateLimit from '@fastify/rate-limit';
import {
  checkDatabase,
  createService,
  globalErrorHandler,
  optionalEnv,
  registerHealthRoutes,
  requireEnv,
  startService,
} from '@nexus/service-utils';
import { NexusProducer } from '@nexus/kafka';
import { PrismaClient } from '@prisma/client';
import { buildDatabaseUrl } from '@nexus/service-utils/db';
import { createWorkflowPrisma } from './prisma.js';
import { registerRoutes } from './routes/index.js';
import { startTriggerConsumer } from './consumers/trigger.consumer.js';
import { startBranchConsumer } from './consumers/branch.consumer.js';
import { startGdprConsumer } from './consumers/gdpr.consumer.js';
import { createExecutionsService } from './services/executions.service.js';
import { registerGraphQL } from './graphql/index.js';

startTracing({ serviceName: 'workflow-service' });
const prismaHealth = new (PrismaClient as any)({
  datasources: {
    db: {
      url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10 }),
    },
  },
});
const prisma = createWorkflowPrisma();
const producer = new NexusProducer('workflow-service');

const env = requireEnv(['DATABASE_URL', 'JWT_SECRET']);
const port = Number(optionalEnv('PORT', '3007'));
const jwtSecret = env.JWT_SECRET;

const app = await createService({
  name: 'workflow-service',
  port,
  jwtSecret,
  corsOrigins: optionalEnv('CORS_ORIGINS', 'http://localhost:3000')
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

registerHealthRoutes(app, 'workflow-service', [() => checkDatabase(prismaHealth)]);
app.setErrorHandler(globalErrorHandler);

let branchConsumer: Awaited<ReturnType<typeof startBranchConsumer>> | null = null;
let gdprConsumer: Awaited<ReturnType<typeof startGdprConsumer>> | null = null;
try {
  await producer.connect();
  await startTriggerConsumer(prisma, producer);
  branchConsumer = await startBranchConsumer(prisma, producer);
  gdprConsumer = await startGdprConsumer(prisma);
  app.log.info('Workflow trigger + branch consumers started');
} catch (err) {
  app.log.warn({ err }, 'Workflow Kafka consumers failed to start');
}

app.addHook('onClose', async () => {
  try { await branchConsumer?.disconnect(); } catch (err) { app.log.warn({ err }, 'Branch consumer disconnect failed'); }
  try { await gdprConsumer?.disconnect(); } catch (err) { app.log.warn({ err }, 'GDPR consumer disconnect failed'); }
  try { await producer.disconnect(); } catch (err) { app.log.warn({ err }, 'Producer disconnect failed'); }
});

const executions = createExecutionsService(prisma, producer);

// Resume any PAUSED executions whose resumeAt has passed (poll every 30 s)
setInterval(async () => {
  try {
    const due = await prisma.workflowExecution.findMany({
      where: { status: 'PAUSED', resumeAt: { lte: new Date() } },
      select: { id: true },
      take: 50,
    });
    const CONCURRENCY = 5;
    for (let i = 0; i < due.length; i += CONCURRENCY) {
      const batch = due.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(({ id }: { id: string }) =>
          executions.runExecution(id).catch((err) => app.log.warn({ err, id }, 'execution resume failed'))
        )
      );
    }
  } catch (err) {
    app.log.warn({ err }, 'Paused execution poll failed');
  }
}, 30_000);

await registerGraphQL(app, prisma);

await startService(app, port, async (a) => {
  await registerRoutes(a, prisma, producer);
});