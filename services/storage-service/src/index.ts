import 'dotenv/config';
import rateLimit from '@fastify/rate-limit';
import {
  checkDatabase,
  createService,
  globalErrorHandler,
  registerHealthRoutes,
  startService,
} from '@nexus/service-utils';
import { PrismaClient } from '../../../node_modules/.prisma/storage-client/index.js';
import { createStoragePrisma } from './prisma.js';
import { createMinioClient, ensureBucket } from './minio.js';
import { createFilesService } from './services/files.service.js';
import { registerFilesRoutes } from './routes/files.routes.js';

const prismaHealth = new PrismaClient();
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

app.addHook('onClose', async () => {
  await prismaHealth.$disconnect();
});

const files = createFilesService(prisma, minio, bucket);

await startService(app, port, async (a) => {
  await registerFilesRoutes(a, files);
});