import 'dotenv/config';
import {
  checkDatabase,
  createService,
  globalErrorHandler,
  registerHealthRoutes,
  startService,
} from '@nexus/service-utils';
import { NexusProducer } from '@nexus/kafka';
import { PrismaClient } from '@prisma/client';
import { createWorkflowPrisma } from './prisma.js';
import { registerWorkflowsRoutes } from './routes/workflows.routes.js';
import { registerExecutionsRoutes } from './routes/executions.routes.js';
import { startTriggerConsumer } from './consumers/trigger.consumer.js';
import { createExecutionsService } from './services/executions.service.js';

const prismaHealth = new (PrismaClient as any)();
const prisma = createWorkflowPrisma();
const producer = new NexusProducer('workflow-service');

const port = Number(process.env.PORT ?? 3007);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters (Section 26).');
}

const app = await createService({
  name: 'workflow-service',
  port,
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim()),
});
registerHealthRoutes(app, 'workflow-service', [() => checkDatabase(prismaHealth)]);
app.setErrorHandler(globalErrorHandler);

try {
  await producer.connect();
  await startTriggerConsumer(prisma, producer);
  app.log.info('Workflow trigger consumer started');
} catch (err) {
  app.log.warn({ err }, 'Workflow trigger consumer failed to start');
}

app.addHook('onClose', async () => {
  try {
    await producer.disconnect();
  } catch {
    // ignore close disconnect failures
  }
});

const executions = createExecutionsService(prisma, producer);
setInterval(async () => {
  try {
    await executions.resumePausedExecutions();
  } catch {
    // ignore scheduler tick errors
  }
}, 15_000).unref();

await startService(app, port, async (a) => {
  await registerWorkflowsRoutes(a, prisma, producer);
  await registerExecutionsRoutes(a, prisma, producer);
});
