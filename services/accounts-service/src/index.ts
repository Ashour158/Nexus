import 'dotenv/config';
import { createService, registerHealthRoutes, startService, checkDatabase, requireEnv } from '@nexus/service-utils';
import { startTracing } from '@nexus/service-utils/tracing';
import { createAccountsPrisma, tenantAls } from './prisma.js';
import { registerRoutes } from './routes/index.js';
import { registerGraphQL } from './graphql/index.js';

const env = requireEnv(['ACCOUNTS_DATABASE_URL', 'JWT_SECRET']);
const port = Number(process.env.PORT ?? '3031');

startTracing({ serviceName: 'accounts-service' });

const prisma = createAccountsPrisma();

const app = await createService({
  name: 'accounts-service',
  port,
  jwtSecret: env.JWT_SECRET,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
});

// Bridge Fastify request-context tenantId into Prisma tenant ALS
app.addHook('preHandler', async (request) => {
  const tenantId = (request as any).requestContext?.get('tenantId');
  if (tenantId) tenantAls.enterWith({ tenantId });
});

registerHealthRoutes(app, 'accounts-service', [() => checkDatabase(prisma as any)]);

await registerRoutes(app, prisma as any);
await registerGraphQL(app, prisma);

await startService(app, port, async () => {
  await (prisma as any).$disconnect();
});
