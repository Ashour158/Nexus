import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import { createService, startService, registerHealthRoutes } from '@nexus/service-utils';
import { registerRoutes } from './routes/index.js';
import { registerGraphQL } from './graphql/index.js';
import { PrismaClient } from '../../../node_modules/.prisma/document-client/index.js';

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

const prisma = new PrismaClient();

registerHealthRoutes(app, 'document-service', [
  async () => { await prisma.$queryRaw`SELECT 1`; },
]);

await registerRoutes(app);
await registerGraphQL(app, prisma);

await startService(app, port, async () => { /* routes already registered above */ });
