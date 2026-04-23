import 'dotenv/config';
import {
  checkDatabase,
  createService,
  globalErrorHandler,
  registerHealthRoutes,
  startService,
} from '@nexus/service-utils';
import { PrismaClient } from '../../../node_modules/.prisma/auth-client/index.js';
import { createAuthPrisma } from './prisma.js';
import { registerAllRoutes } from './routes/index.js';

const prismaHealth = new PrismaClient();
const prisma = createAuthPrisma();

const port = Number(process.env.PORT ?? 3010);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters (Section 26).');
}

const app = await createService({
  name: 'auth-service',
  port,
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
});

registerHealthRoutes(app, 'auth-service', [() => checkDatabase(prismaHealth)]);

app.setErrorHandler(globalErrorHandler);

await startService(app, port, async (a) => {
  await registerAllRoutes(a, prisma);
});
