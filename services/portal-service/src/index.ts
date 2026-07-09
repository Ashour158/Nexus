import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import { createService, startService, globalErrorHandler, registerHealthRoutes, checkDatabase } from '@nexus/service-utils';
import { NexusProducer } from '@nexus/kafka';
import { getPrisma } from './prisma.js';
import { createPortalService } from './services/portal.service.js';
import { registerRoutes } from './routes/index.js';
import { registerGraphQL } from './graphql/index.js';

startTracing({ serviceName: 'portal-service' });
const port = parseInt(process.env.PORT ?? '3022', 10);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}

const app = await createService({
  name: 'portal-service',
  port,
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
  // Customer-facing portal routes are consumed via a share token in the URL
  // (`GET /portal/:token`, plus /accept, /reject, /download) and carry NO
  // end-user JWT. They must bypass the global JWT preHandler; the token itself
  // is validated (existence + expiry) inside the portal service. The admin/CRUD
  // routes live under `/api/v1/portal/...`, which does NOT match this prefix and
  // therefore remains JWT- + permission-protected.
  publicPrefixes: ['/portal/'],
});

const prisma = getPrisma();

// Best-effort event producer so portal engagement (view / accept / reject /
// download) reaches the internal CRM timeline. Fail-open: if the broker is
// unreachable, the service still starts and portal endpoints keep working.
const producer = new NexusProducer('portal-service');
try {
  await producer.connect();
  app.log.info('Kafka producer connected');
} catch (err) {
  app.log.warn({ err }, 'Kafka producer connect failed; continuing without event publishing');
}
app.addHook('onClose', async () => {
  try {
    await producer.disconnect();
  } catch (err) {
    app.log.warn({ err }, 'Producer disconnect failed');
  }
});

app.setErrorHandler(globalErrorHandler);
registerHealthRoutes(app, 'portal-service', [() => checkDatabase(prisma)]);

const portalSvc = createPortalService(prisma, producer);

await registerGraphQL(app, prisma);

await startService(app, port, async () => {
  await registerRoutes(app, portalSvc);
});
