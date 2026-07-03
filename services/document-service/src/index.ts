import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import { createService, startService, registerHealthRoutes, checkDatabase } from '@nexus/service-utils';
import { registerRoutes } from './routes/index.js';
import { registerGraphQL } from './graphql/index.js';
import { PrismaClient } from '../../../node_modules/.prisma/document-client/index.js';
import { createTenantPrismaExtension } from '@nexus/service-utils/prisma-tenant';
import { AsyncLocalStorage } from 'node:async_hooks';

const tenantAls = new AsyncLocalStorage<{ tenantId: string }>();

startTracing({ serviceName: 'document-service' });
const port = parseInt(process.env.PORT ?? '3016', 10);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}

const app = await createService({
  name: 'document-service',
  port,
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
});

const prismaBase = new PrismaClient();
const prisma = prismaBase.$extends(
  createTenantPrismaExtension(prismaBase as any, {
    getTenantId: () => tenantAls.getStore()?.tenantId,
    skipModels: new Set(['DocumentVersion', 'DocumentPermission']),
  })
);

// Bridge Fastify request-context tenantId into Prisma tenant ALS
app.addHook('preHandler', async (request) => {
  const tenantId = (request as any).requestContext?.get('tenantId');
  if (tenantId) tenantAls.enterWith({ tenantId });
});

registerHealthRoutes(app, 'document-service', [() => checkDatabase(prismaBase)]);

await registerRoutes(app);
await registerGraphQL(app, prisma);

await startService(app, port, async () => { /* routes already registered above */ });
