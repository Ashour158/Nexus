import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import rateLimit from '@fastify/rate-limit';
import {
  checkDatabase,
  createService,
  globalErrorHandler,
  optionalEnv,
  registerHealthRoutes,
  requireEnv,
  startService,
} from '@nexus/service-utils';
import { NexusProducer } from '@nexus/kafka';
import { PrismaClient } from '../../../node_modules/.prisma/workflow-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';
import { createWorkflowPrisma } from './prisma.js';
import { registerRoutes } from './routes/index.js';
import { startTriggerConsumer } from './consumers/trigger.consumer.js';
import { startAutomationConsumer } from './consumers/automation.consumer.js';
import { startAutomationDlqReplayConsumer } from './consumers/automation-dlq.consumer.js';
import { startBranchConsumer } from './consumers/branch.consumer.js';
import { startApprovalConsumer } from './consumers/approval.consumer.js';
import { startGdprConsumer } from './consumers/gdpr.consumer.js';
import { startSlaScanner } from './services/sla-scanner.js';
import { startScheduleTrigger } from './services/schedule-trigger.js';
import { startJourneyEnrollmentConsumer } from './consumers/journey-enrollment.consumer.js';
import { startJourneyScheduler } from './services/journey-engine.js';
import { startScheduledActionPoller } from './services/scheduled-actions.service.js';
import { createExecutionsService } from './services/executions.service.js';
import { registerGraphQL } from './graphql/index.js';

startTracing({ serviceName: 'workflow-service' });
const prismaHealth = new (PrismaClient as any)({
  datasources: {
    db: {
      url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10 }),
    },
  },
});
const prisma = createWorkflowPrisma();
const producer = new NexusProducer('workflow-service');

const env = requireEnv(['DATABASE_URL', 'JWT_SECRET']);
const port = Number(optionalEnv('PORT', '3007'));
const jwtSecret = env.JWT_SECRET;

const app = await createService({
  name: 'workflow-service',
  port,
  jwtSecret,
  corsOrigins: optionalEnv('CORS_ORIGINS', 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim()),
});

// Parameterless transition POSTs (e.g. /journeys/:id/activate | /pause | /archive)
// take no body, but a client that sends `Content-Type: application/json` with an
// EMPTY body makes Fastify's default JSON parser throw FST_ERR_CTP_EMPTY_JSON_BODY
// → an unhandled 500. Treat an empty/whitespace JSON body as `{}` so these routes
// (which read nothing off request.body) succeed regardless of the empty payload.
app.addContentTypeParser(
  'application/json',
  { parseAs: 'string' },
  (_req, body: string, done) => {
    const raw = typeof body === 'string' ? body.trim() : body;
    if (!raw) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(raw as string));
    } catch (err) {
      (err as { statusCode?: number }).statusCode = 400;
      done(err as Error, undefined);
    }
  }
);
await app.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: '1 minute',
  errorResponseBuilder: (_req, context) => ({
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: `Too many requests. Retry after ${context.after}.`,
  }),
});

registerHealthRoutes(app, 'workflow-service', [() => checkDatabase(prismaHealth)]);
app.setErrorHandler(globalErrorHandler);

let branchConsumer: Awaited<ReturnType<typeof startBranchConsumer>> | null = null;
let approvalConsumer: Awaited<ReturnType<typeof startApprovalConsumer>> | null = null;
let gdprConsumer: Awaited<ReturnType<typeof startGdprConsumer>> | null = null;
let journeyEnrollmentConsumer: Awaited<ReturnType<typeof startJourneyEnrollmentConsumer>> | null = null;
let automationConsumer: Awaited<ReturnType<typeof startAutomationConsumer>> | null = null;
let automationDlqReplayConsumer: Awaited<ReturnType<typeof startAutomationDlqReplayConsumer>> | null = null;
try {
  await producer.connect();
  await startTriggerConsumer(prisma, producer);
  // Cross-module automation-rules consumer — fail-open, isolated from the others.
  try {
    automationConsumer = await startAutomationConsumer(prisma, producer);
  } catch (err) {
    app.log.warn({ err }, 'Automation-rules consumer failed to start');
  }
  // AU-4 DLQ replay — opt-in re-driver for parked automation events.
  if (process.env.AUTOMATION_DLQ_REPLAY_ENABLED === 'true') {
    try {
      automationDlqReplayConsumer = await startAutomationDlqReplayConsumer(prisma, producer);
      app.log.info('Automation DLQ replay consumer started');
    } catch (err) {
      app.log.warn({ err }, 'Automation DLQ replay consumer failed to start');
    }
  }
  branchConsumer = await startBranchConsumer(prisma, producer);
  approvalConsumer = await startApprovalConsumer(prisma, producer, app.log);
  gdprConsumer = await startGdprConsumer(prisma);
  // CommandCenter auto-enrollment — fail-open, never blocks the other consumers.
  try {
    journeyEnrollmentConsumer = await startJourneyEnrollmentConsumer(prisma, producer, app.log);
  } catch (err) {
    app.log.warn({ err }, 'Journey enrollment consumer failed to start');
  }
  app.log.info('Workflow trigger + branch + approval + journey consumers started');
} catch (err) {
  app.log.warn({ err }, 'Workflow Kafka consumers failed to start');
}

app.addHook('onClose', async () => {
  try { await branchConsumer?.disconnect(); } catch (err) { app.log.warn({ err }, 'Branch consumer disconnect failed'); }
  try { await approvalConsumer?.disconnect(); } catch (err) { app.log.warn({ err }, 'Approval consumer disconnect failed'); }
  try { await gdprConsumer?.disconnect(); } catch (err) { app.log.warn({ err }, 'GDPR consumer disconnect failed'); }
  try { await journeyEnrollmentConsumer?.disconnect(); } catch (err) { app.log.warn({ err }, 'Journey enrollment consumer disconnect failed'); }
  try { await automationConsumer?.disconnect(); } catch (err) { app.log.warn({ err }, 'Automation-rules consumer disconnect failed'); }
  try { await automationDlqReplayConsumer?.disconnect(); } catch (err) { app.log.warn({ err }, 'Automation DLQ replay consumer disconnect failed'); }
  try { await producer.disconnect(); } catch (err) { app.log.warn({ err }, 'Producer disconnect failed'); }
});

const executions = createExecutionsService(prisma, producer);

// Resume any PAUSED executions whose resumeAt has passed (poll every 30 s)
setInterval(async () => {
  try {
    const due = await prisma.workflowExecution.findMany({
      where: { status: 'PAUSED', resumeAt: { lte: new Date() } },
      select: { id: true },
      take: 50,
    });
    const CONCURRENCY = 5;
    for (let i = 0; i < due.length; i += CONCURRENCY) {
      const batch = due.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(({ id }: { id: string }) =>
          executions.runExecution(id).catch((err) => app.log.warn({ err, id }, 'execution resume failed'))
        )
      );
    }
  } catch (err) {
    app.log.warn({ err }, 'Paused execution poll failed');
  }
}, 30_000);

// Scan active SLA definitions for breaches (poll every 60 s)
startSlaScanner(prisma, app.log, 60_000, producer);

// Fire schedule-triggered workflows (trigger === 'schedule') on a timer.
// Tick interval configurable via WORKFLOW_SCHEDULE_TICK_MS (default 60 s).
startScheduleTrigger(prisma, producer, app.log);

// CommandCenter — advance due journey enrollments (resumeAt <= now) on a timer.
// Tick interval configurable via JOURNEY_SCHEDULE_TICK_MS (default 30 s).
startJourneyScheduler(prisma, producer, app.log);

// WF-DEPTH — execute due time-delayed / date-relative automation actions
// (ScheduledAutomationAction rows). Re-checks each rule's criteria at fire time
// and runs the action(s) through the shared engine node handlers. Uses the same
// producer so NOTIFY/EMAIL actions can publish. Tick interval configurable via
// SCHEDULED_ACTION_TICK_MS (default 30 s).
startScheduledActionPoller(prisma, producer, app.log);

await registerGraphQL(app, prisma);

await startService(app, port, async (a) => {
  await registerRoutes(a, prisma, producer);
});