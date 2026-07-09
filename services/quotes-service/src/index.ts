import 'dotenv/config';
import { createService, registerHealthRoutes, startService, checkDatabase, requireEnv } from '@nexus/service-utils';
import { startTracing } from '@nexus/service-utils/tracing';
import { createQuotesPrisma, tenantAls } from './prisma.js';
import { registerRoutes } from './routes/index.js';
import { startQuoteExpiryPoller } from './lib/quote-expiry.poller.js';
import { disconnectQuoteProducer } from './services/quote-events.js';

const env = requireEnv(['QUOTES_DATABASE_URL', 'JWT_SECRET']);
const port = Number(process.env.PORT ?? '3033');

startTracing({ serviceName: 'quotes-service' });

const prisma = createQuotesPrisma();

const app = await createService({
  name: 'quotes-service',
  port,
  jwtSecret: env.JWT_SECRET,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
});

// Bridge Fastify request-context tenantId into Prisma tenant ALS
app.addHook('preHandler', async (request) => {
  const tenantId = (request as any).requestContext?.get('tenantId');
  if (tenantId) tenantAls.enterWith({ tenantId });
});

registerHealthRoutes(app, 'quotes-service', [() => checkDatabase(prisma as any)]);

await registerRoutes(app, prisma as any);

// Quote-expiry poller (additive, fail-open). Guarded so a start failure can
// never break the service; the interval is unref'd inside the poller.
let quoteExpiryPoller: ReturnType<typeof startQuoteExpiryPoller> | null = null;
try {
  const intervalRaw = process.env.QUOTE_EXPIRY_INTERVAL_MS;
  const intervalMs = intervalRaw ? Number(intervalRaw) : undefined;
  quoteExpiryPoller = startQuoteExpiryPoller(prisma as any, {
    intervalMs: intervalMs && Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : undefined,
  });
  app.log.info('Quote-expiry poller started');
} catch (err) {
  app.log.warn({ err }, 'Quote-expiry poller failed to start; continuing without expiry');
}

await startService(app, port, async () => {
  try { quoteExpiryPoller?.stop(); } catch { /* ignore */ }
  try { await disconnectQuoteProducer(); } catch { /* ignore */ }
  await (prisma as any).$disconnect();
});
