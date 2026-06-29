import { startTracing } from '@nexus/service-utils/tracing';
import { createService, startService, globalErrorHandler } from '@nexus/service-utils';
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
});

const prisma = getPrisma();

app.setErrorHandler(globalErrorHandler);

const portalSvc = createPortalService(prisma);

await registerGraphQL(app, prisma);

await startService(app, port, async () => {
  await registerRoutes(app, portalSvc);
});
