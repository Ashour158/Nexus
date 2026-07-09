import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import { createService, startService, globalErrorHandler, registerHealthRoutes, checkDatabase } from '@nexus/service-utils';
import rateLimit from '@fastify/rate-limit';
import { getPrisma } from './prisma.js';
import { createReportsService } from './services/reports.service.js';
import { registerReportsRoutes } from './routes/reports.routes.js';
import { registerSavedReportsRoutes } from './routes/saved-reports.routes.js';
import { registerDashboardsRoutes } from './routes/dashboards.routes.js';
import { registerFunnelRoutes } from './routes/funnel.routes.js';
import { registerBiRoutes } from './routes/bi.routes.js';
import { registerExportRoutes } from './routes/export.routes.js';
import { startSnapshotScheduler } from './lib/snapshot.job.js';
import { startScheduleRunner } from './lib/schedule-runner.js';
import { registerGraphQL } from './graphql/index.js';

startTracing({ serviceName: 'reporting-service' });
const port = parseInt(process.env.PORT ?? '3021', 10);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}

const app = await createService({
  name: 'reporting-service',
  port,
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
});

const prisma = getPrisma();
const reports = createReportsService(prisma);

app.setErrorHandler(globalErrorHandler);

await app.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: '1 minute',
  errorResponseBuilder: (_req: any, context: any) => ({
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: `Too many requests. Retry after ${context.after}.`,
  }),
});

registerHealthRoutes(app, 'reporting-service', [() => checkDatabase(prisma)]);

app.addHook('onClose', async () => {
  await prisma.$disconnect();
});

await registerGraphQL(app, prisma);

await startService(app, port, async (a) => {
  await registerReportsRoutes(a, reports, prisma);
  await registerSavedReportsRoutes(a, prisma);
  await registerDashboardsRoutes(a, prisma);
  await registerFunnelRoutes(a, prisma);
  await registerBiRoutes(a, prisma);
  await registerExportRoutes(a, reports, prisma);

  // Start background jobs (non-blocking)
  try {
    startSnapshotScheduler(prisma);
  } catch (err) {
    a.log.warn({ err }, 'Snapshot scheduler failed to start');
  }
  try {
    // Single consolidated schedule runner: renders + delivers BOTH the
    // self-serve ReportSchedule and the legacy DefinitionReportSchedule models
    // through the comm outbox email path (RR-H20 — previously the definition
    // schedules never executed).
    startScheduleRunner(prisma);
  } catch (err) {
    a.log.warn({ err }, 'Schedule runner failed to start');
  }
});
