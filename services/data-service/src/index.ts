import { startTracing } from '@nexus/service-utils/tracing';
import { createService, startService, globalErrorHandler } from '@nexus/service-utils';
import { NexusProducer } from '@nexus/kafka';
import { getPrisma } from './prisma.js';
import { registerImportRoutes } from './routes/import.routes.js';
import { registerExportRoutes } from './routes/export.routes.js';
import { registerRecycleRoutes } from './routes/recycle.routes.js';
import { registerAuditRoutes } from './routes/audit.routes.js';
import { registerViewsRoutes } from './routes/views.routes.js';
import { registerGraphQL } from './graphql/index.js';
import { startRetentionJob } from './jobs/retention.job.js';

startTracing({ serviceName: 'data-service' });
const port = parseInt(process.env.PORT ?? '3015', 10);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}

const app = await createService({
  name: 'data-service',
  port,
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
});

const prisma = getPrisma();
const producer = new NexusProducer('data-service');

app.setErrorHandler(globalErrorHandler);

await producer.connect().catch(() => undefined);
app.addHook('onClose', async () => {
  try { await producer.disconnect(); } catch { /* ignore */ }
});

await registerGraphQL(app, prisma);

const retentionJob = startRetentionJob(prisma);

await startService(app, port, async () => {
  await registerImportRoutes(app, prisma, producer);
  await registerExportRoutes(app, prisma);
  await registerRecycleRoutes(app, prisma);
  await registerAuditRoutes(app, prisma);
  await registerViewsRoutes(app, prisma);
});

app.addHook('onClose', async () => {
  retentionJob.stop();
});
