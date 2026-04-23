import 'dotenv/config';
import {
  checkDatabase,
  createService,
  globalErrorHandler,
  registerHealthRoutes,
  startService,
} from '@nexus/service-utils';
import { NexusProducer } from '@nexus/kafka';
import { PrismaClient } from '../../../node_modules/.prisma/finance-client/index.js';
import { createFinancePrisma } from './prisma.js';
import { registerAllRoutes } from './routes/index.js';

const prismaHealth = new PrismaClient();
const prisma = createFinancePrisma();
const producer = new NexusProducer('finance-service');

const port = Number(process.env.PORT ?? 3002);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters (Section 26).');
}

const app = await createService({
  name: 'finance-service',
  port,
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim()),
});

registerHealthRoutes(app, 'finance-service', [() => checkDatabase(prismaHealth)]);

app.setErrorHandler(globalErrorHandler);

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
