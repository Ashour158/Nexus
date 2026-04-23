import 'dotenv/config';
import {
  checkDatabase,
  createService,
  globalErrorHandler,
  registerHealthRoutes,
  startService,
} from '@nexus/service-utils';
import { NexusProducer } from '@nexus/kafka';
import { PrismaClient } from '../../../node_modules/.prisma/crm-client/index.js';
import { createCrmPrisma } from './prisma.js';
import { registerAllRoutes } from './routes/index.js';

const prismaHealth = new PrismaClient();
const prisma = createCrmPrisma();
const producer = new NexusProducer('crm-service');

const port = Number(process.env.PORT ?? 3001);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters (Section 26).');
}

const app = await createService({
  name: 'crm-service',
  port,
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim()),
});

registerHealthRoutes(app, 'crm-service', [() => checkDatabase(prismaHealth)]);

app.setErrorHandler(globalErrorHandler);

// Connect to Kafka on startup; tolerate broker downtime in dev by logging and
// continuing — writes will throw per-request if the cluster is unreachable.
try {
  await producer.connect();
  app.log.info('Kafka producer connected');
} catch (err) {
  app.log.warn({ err }, 'Kafka producer connect failed; continuing without events');
}

app.addHook('onClose', async () => {
  try {
    await producer.disconnect();
  } catch {
    /* ignore */
  }
});

await startService(app, port, async (a) => {
  await registerAllRoutes(a, prisma, producer);
});
