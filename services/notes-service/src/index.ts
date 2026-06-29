import 'dotenv/config';
import { createService, registerHealthRoutes, startService, checkDatabase, requireEnv } from '@nexus/service-utils';
import { startTracing } from '@nexus/service-utils/tracing';
import { createNotesPrisma, tenantAls } from './prisma.js';
import { registerRoutes } from './routes/index.js';

const env = requireEnv(['NOTES_DATABASE_URL', 'JWT_SECRET']);
const port = Number(process.env.PORT ?? '3032');

startTracing({ serviceName: 'notes-service' });

const prisma = createNotesPrisma();

const app = await createService({
  name: 'notes-service',
  port,
  jwtSecret: env.JWT_SECRET,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
});

// Bridge Fastify request-context tenantId into Prisma tenant ALS
app.addHook('preHandler', async (request) => {
  const tenantId = (request as any).requestContext?.get('tenantId');
  if (tenantId) tenantAls.enterWith({ tenantId });
});

registerHealthRoutes(app, 'notes-service', [() => checkDatabase(prisma as any)]);

await registerRoutes(app, prisma as any);

await startService(app, port, async () => {
  await (prisma as any).$disconnect();
});
