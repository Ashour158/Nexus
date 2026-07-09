import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import {
  checkDatabase,
  createService,
  globalErrorHandler,
  registerHealthRoutes,
  requireEnv,
  startService,
} from '@nexus/service-utils';
import { PrismaClient } from '../../../node_modules/.prisma/audit-consumer-client/index.js';
import { AuditConsumer } from './consumer.js';
import { registerInternalOperationAuditRoutes } from './internal-operation-audit.routes.js';

startTracing({ serviceName: 'audit-consumer' });

const env = requireEnv(['AUDIT_DATABASE_URL']);
const port = Number(process.env.PORT ?? '3028');

const app = await createService({
  name: 'audit-consumer',
  port,
  jwtSecret: process.env.JWT_SECRET ?? 'audit-consumer-local-secret-min-32-chars',
  publicPrefixes: ['/api/v1/internal/audit'],
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim()),
});

app.setErrorHandler(globalErrorHandler);

const prismaHealth = new PrismaClient({
  datasources: {
    db: { url: env.AUDIT_DATABASE_URL },
  },
  log: ['error'],
});

const auditConsumer = new AuditConsumer('audit-consumer-group');

registerHealthRoutes(app, 'audit-consumer', [
  () => checkDatabase(prismaHealth),
  async () => {
    const running = auditConsumer.isRunning();
    return {
      name: 'kafka-consumer',
      ok: running,
    };
  },
]);

app.addHook('onClose', async () => {
  await auditConsumer.stop();
});

await auditConsumer.start();

await startService(app, port, async () => {
  registerInternalOperationAuditRoutes(app, prismaHealth);
});
