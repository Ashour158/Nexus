import { startTracing } from '@nexus/service-utils/tracing';
import { createService, startService, globalErrorHandler } from '@nexus/service-utils';
import { NexusProducer } from '@nexus/kafka';
import { getPrisma } from './prisma.js';
import { registerPoliciesRoutes } from './routes/policies.routes.js';
import { registerRequestsRoutes } from './routes/requests.routes.js';
import { registerGraphQL } from './graphql/index.js';
import { startGdprConsumer } from './consumers/gdpr.consumer.js';

startTracing({ serviceName: 'approval-service' });
const port = parseInt(process.env.PORT ?? '3014', 10);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}

const app = await createService({
  name: 'approval-service',
  port,
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
});

const prisma = getPrisma();
const producer = new NexusProducer('approval-service');

app.setErrorHandler(globalErrorHandler);

const gdprConsumer = await startGdprConsumer(prisma).catch((err) => {
  console.warn('GDPR consumer failed to start;', err);
  return null;
});

await producer.connect().catch(() => undefined);
app.addHook('onClose', async () => {
  try { await gdprConsumer?.disconnect(); } catch { /* ignore */ }
  try { await producer.disconnect(); } catch { /* ignore */ }
});

await registerGraphQL(app, prisma);

await startService(app, port, async () => {
  await registerPoliciesRoutes(app, prisma);
  await registerRequestsRoutes(app, prisma, producer);
});
