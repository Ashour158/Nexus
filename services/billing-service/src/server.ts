import {
  createService,
  globalErrorHandler,
  registerHealthRoutes,
  requireEnv,
  optionalEnv,
  checkDatabase,
} from '@nexus/service-utils';
import { PrismaClient } from '../../../node_modules/.prisma/billing-client/index.js';
import { NexusProducer } from '@nexus/kafka';
import type { FastifyInstance } from 'fastify';
import { createBillingPrisma } from './prisma.js';
import { registerAllBillingRoutes } from './routes/index.js';

export async function buildServer(): Promise<{
  app: FastifyInstance;
  prismaHealth: PrismaClient;
}> {
  const prismaHealth = new PrismaClient({
    datasources: { db: { url: process.env.BILLING_DATABASE_URL } },
  });

  const producer = new NexusProducer('billing-service');
  const prisma = createBillingPrisma();
  const env = requireEnv(['BILLING_DATABASE_URL', 'JWT_SECRET']);
  const jwtSecret = env.JWT_SECRET;

  const app = await createService({
    name: 'billing-service',
    port: Number(optionalEnv('PORT', '3011')),
    jwtSecret,
    corsOrigins: optionalEnv('CORS_ORIGINS', 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim()),
  });

  registerHealthRoutes(app, 'billing-service', [() => checkDatabase(prismaHealth)]);
  app.setErrorHandler(globalErrorHandler);

  try {
    await producer.connect();
    app.log.info('Kafka producer connected');
  } catch (err) {
    app.log.warn({ err }, 'Kafka producer connect failed; continuing without event publishing');
  }

  app.addHook('onClose', async () => {
    try {
      await producer.disconnect();
    } catch {
      /* ignore */
    }
  });

  await registerAllBillingRoutes(app, prisma, producer);

  return { app, prismaHealth };
}
