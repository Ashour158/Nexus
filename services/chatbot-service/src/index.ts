import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { globalErrorHandler, startService } from '@nexus/service-utils';
import { getPrisma } from './prisma.js';
import { registerWhatsAppRoutes } from './routes/whatsapp.routes.js';
import { registerTelegramRoutes } from './routes/telegram.routes.js';

const app = Fastify({ logger: true });
const prisma = getPrisma();

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
app.setErrorHandler(globalErrorHandler);

await registerWhatsAppRoutes(app, prisma);
await registerTelegramRoutes(app, prisma);

const port = parseInt(process.env.PORT ?? '3017', 10);
await startService(app, port, async () => {
  await prisma.$disconnect();
});