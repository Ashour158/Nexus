import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import { createService, startService, registerHealthRoutes, checkDatabase } from '@nexus/service-utils';
import { getPrisma } from './prisma.js';
import { registerWhatsAppRoutes } from './routes/whatsapp.routes.js';
import { registerTelegramRoutes } from './routes/telegram.routes.js';
import { registerGraphQL } from './graphql/index.js';

startTracing({ serviceName: 'chatbot-service' });
const port = parseInt(process.env.PORT ?? '3017', 10);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}

const app = await createService({
  name: 'chatbot-service',
  port,
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
});

// Capture raw body for webhook signature verification
app.addHook('preParsing', async (request, _reply, payload) => {
  if (!request.url.startsWith('/api/v1/webhooks/')) return;
  const chunks: Buffer[] = [];
  payload.on('data', (chunk: Buffer) => chunks.push(chunk));
  payload.on('end', () => {
    (request as any).rawBody = Buffer.concat(chunks);
  });
});

const prisma = getPrisma();

registerHealthRoutes(app, 'chatbot-service', [() => checkDatabase(prisma)]);

await registerWhatsAppRoutes(app, prisma);
await registerTelegramRoutes(app, prisma);

await registerGraphQL(app, prisma);

await startService(app, port, async () => {
  await prisma.$disconnect();
});
