import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import rateLimit from '@fastify/rate-limit';
import { createService, globalErrorHandler, startService } from '@nexus/service-utils';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createRedisClient } from '@nexus/service-utils';
import { socketAuthMiddleware } from './socket/auth.middleware.js';
import { registerAccountSocketHandlers } from './socket/handlers/account.handler.js';
import { registerDealSocketHandlers } from './socket/handlers/deal.handler.js';
import { registerContactSocketHandlers } from './socket/handlers/contact.handler.js';
import { registerNotificationSocketHandlers } from './socket/handlers/notification.handler.js';
import { tenantRoom, userRoom } from './socket/rooms.js';
import { startDealConsumer } from './consumers/deal.consumer.js';
import { startNotificationConsumer } from './consumers/notification.consumer.js';
import { startActivityConsumer } from './consumers/activity.consumer.js';
import { startQuoteConsumer } from './consumers/quote.consumer.js';
import { registerRealtimeHealthRoutes } from './routes/health.routes.js';
import { registerGraphQL } from './graphql/index.js';
import type { AuthedSocket } from './socket/auth.middleware.js';

startTracing({ serviceName: 'realtime-service' });
const port = Number(process.env.PORT ?? 3005);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}
const jwksUrl = process.env.AUTH_JWKS_URL ?? 'http://auth-service:3010/.well-known/jwks.json';

const app = await createService({
  name: 'realtime-service',
  port,
  jwtSecret,
  jwksUrl,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
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

app.setErrorHandler(globalErrorHandler);

const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim());

const io = new Server(app.server, {
  cors: { origin: allowedOrigins },
  transports: ['websocket', 'polling'],
});

// Redis adapter for multi-node room synchronization (M2.5)
const pubClient = createRedisClient();
const subClient = pubClient.duplicate();
io.adapter(createAdapter(pubClient, subClient));
app.log.info('Socket.IO Redis adapter enabled');
registerRealtimeHealthRoutes(app, pubClient);

await registerGraphQL(app);

io.use(socketAuthMiddleware());
io.on('connection', (socket) => {
  const authed = socket as AuthedSocket;
  const tenantId = authed.data.user.tenantId;
  const userId = authed.data.user.sub;
  socket.join(tenantRoom(tenantId));
  socket.join(userRoom(userId));
  registerAccountSocketHandlers(socket);
  registerDealSocketHandlers(socket);
  registerContactSocketHandlers(socket);
  registerNotificationSocketHandlers(socket);
});

try {
  await startDealConsumer(io);
  await startNotificationConsumer(io);
  await startActivityConsumer(io);
  await startQuoteConsumer(io);
  app.log.info('Realtime Kafka consumers started');
} catch (err) {
  app.log.warn({ err }, 'Kafka consumers failed; WebSocket-only mode');
}

app.addHook('onClose', async () => {
  try { await pubClient.quit(); } catch { /* ignore */ }
  try { await subClient.quit(); } catch { /* ignore */ }
});

await startService(app, port, async () => { /* routes registered above */ });
