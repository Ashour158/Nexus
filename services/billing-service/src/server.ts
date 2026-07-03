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
import { startFinanceSubscriptionConsumer } from './consumers/finance-subscription.consumer.js';

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

  // finance-service is the quote-to-cash system-of-record. Mirror its
  // `subscription.created` events into billing so billing/Stripe reflect the
  // SoR. Best-effort: if the consumer fails to start, billing keeps serving.
  let financeSubscriptionConsumer: Awaited<
    ReturnType<typeof startFinanceSubscriptionConsumer>
  > | null = null;
  try {
    financeSubscriptionConsumer = await startFinanceSubscriptionConsumer(prisma, app.log, producer);
    app.log.info('Finance subscription consumer started');
  } catch (err) {
    app.log.warn({ err }, 'Finance subscription consumer failed to start; continuing without SoR mirroring');
  }

  app.addHook('onClose', async () => {
    try {
      await producer.disconnect();
    } catch {
      /* ignore */
    }
    try {
      await financeSubscriptionConsumer?.disconnect();
    } catch {
      /* ignore */
    }
  });

  await registerAllBillingRoutes(app, prisma, producer);

  return { app, prismaHealth };
}
