import 'dotenv/config';
import {
  checkDatabase,
  createService,
  globalErrorHandler,
  optionalEnv,
  registerHealthRoutes,
  requireEnv,
  startService,
} from '@nexus/service-utils';
import rateLimit from '@fastify/rate-limit';
import type { RouteOptions } from 'fastify';
import { PrismaClient } from '../../../node_modules/.prisma/auth-client/index.js';
import { createAuthPrisma } from './prisma.js';
import { registerAllRoutes } from './routes/index.js';

const prismaHealth = new PrismaClient();
const prisma = createAuthPrisma();

const env = requireEnv(['DATABASE_URL', 'JWT_SECRET']);
const port = Number(optionalEnv('PORT', '3010'));
const jwtSecret = env.JWT_SECRET;

const app = await createService({
  name: 'auth-service',
  port,
  jwtSecret,
  corsOrigins: optionalEnv('CORS_ORIGINS', 'http://localhost:3000').split(',').map((s) => s.trim()),
});

registerHealthRoutes(app, 'auth-service', [() => checkDatabase(prismaHealth)]);

app.setErrorHandler(globalErrorHandler);

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

app.addHook('onRoute', (routeOptions: RouteOptions) => {
  if (
    routeOptions.url.includes('/login') ||
    routeOptions.url.includes('/forgot-password')
  ) {
    routeOptions.config = {
      ...routeOptions.config,
      rateLimit: { max: 10, timeWindow: '1 minute' },
    };
  }
});

await registerAllRoutes(app, prisma);

await startService(app, port, async () => {
  await prisma.$disconnect();
  await prismaHealth.$disconnect();
});
