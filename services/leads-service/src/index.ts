import 'dotenv/config';
import { createService, registerHealthRoutes, startService, checkDatabase, requireEnv } from '@nexus/service-utils';
import { startTracing } from '@nexus/service-utils/tracing';
import { createLeadsPrisma, tenantAls } from './prisma.js';
import { registerRoutes } from './routes/index.js';
import { registerGraphQL } from './graphql/index.js';

const env = requireEnv(['LEADS_DATABASE_URL', 'JWT_SECRET']);
const port = Number(process.env.PORT ?? '3030');

startTracing({ serviceName: 'leads-service' });

const prisma = createLeadsPrisma();

const app = await createService({
  name: 'leads-service',
  port,
  jwtSecret: env.JWT_SECRET,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
});

// Bridge Fastify request-context tenantId into Prisma tenant ALS
app.addHook('preHandler', async (request) => {
  const tenantId = (request as any).requestContext?.get('tenantId');
  if (tenantId) tenantAls.enterWith({ tenantId });
});

registerHealthRoutes(app, 'leads-service', [() => checkDatabase(prisma as any)]);

await registerRoutes(app, prisma as any);
await registerGraphQL(app, prisma);

await startService(app, port, async () => {
  await (prisma as any).$disconnect();
});
