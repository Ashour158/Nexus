import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import rateLimit from '@fastify/rate-limit';
import {
  checkDatabase,
  createService,
  globalErrorHandler,
  registerHealthRoutes,
  startService,
} from '@nexus/service-utils';
import { PrismaClient } from '../../../node_modules/.prisma/storage-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';
import { createStoragePrisma } from './prisma.js';
import { createMinioClient, ensureBucket } from './minio.js';
import { createFilesService } from './services/files.service.js';
import { registerFilesRoutes } from './routes/files.routes.js';
import { registerGraphQL } from './graphql/index.js';
import { disconnectStorageProducer } from './services/storage-events.js';
import { startOrphanCleanupPoller } from './lib/orphan-cleanup.poller.js';

startTracing({ serviceName: 'storage-service' });
const prismaHealth = new PrismaClient({
  datasources: {
    db: {
      url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.STORAGE_DATABASE_URL }),
    },
  },
});
const prisma = createStoragePrisma();
const minio = createMinioClient();
const bucket = process.env.MINIO_BUCKET ?? 'nexus-files';

const port = Number(process.env.PORT ?? 3010);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}

await ensureBucket(minio, bucket);

const app = await createService({
  name: 'storage-service',
  port,
  jwtSecret,
  enableMultipart: true,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3100')
    .split(',')
    .map((s) => s.trim()),
});
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

registerHealthRoutes(app, 'storage-service', [() => checkDatabase(prismaHealth)]);
app.setErrorHandler(globalErrorHandler);

const files = createFilesService(prisma, minio, bucket);

// Orphan object reconciliation poller (additive, fail-open, disabled by default
// via STORAGE_ORPHAN_CLEANUP_ENABLED). A failed start never breaks the service.
let orphanPoller: { stop(): void } | undefined;
try {
  orphanPoller = startOrphanCleanupPoller(prisma, minio, bucket);
  app.log.info('Orphan cleanup poller initialized');
} catch (err) {
  app.log.warn({ err }, 'Orphan cleanup poller failed to start; continuing');
}

app.addHook('onClose', async () => {
  try { orphanPoller?.stop(); } catch (err) { app.log.warn({ err }, 'Orphan poller stop failed'); }
  try { await disconnectStorageProducer(); } catch (err) { app.log.warn({ err }, 'Producer disconnect failed'); }
  await prismaHealth.$disconnect();
});

await registerGraphQL(app, prisma);

await startService(app, port, async (a) => {
  await registerFilesRoutes(a, files);
});