import 'dotenv/config';
import rateLimit from '@fastify/rate-limit';
import { createService, globalErrorHandler, startService } from '@nexus/service-utils';
import { Server } from 'socket.io';
import { socketAuthMiddleware } from './socket/auth.middleware.js';
import { registerDealSocketHandlers } from './socket/handlers/deal.handler.js';
import { registerNotificationSocketHandlers } from './socket/handlers/notification.handler.js';
import { tenantRoom, userRoom } from './socket/rooms.js';
import { startDealConsumer } from './consumers/deal.consumer.js';
import { startNotificationConsumer } from './consumers/notification.consumer.js';
import { startActivityConsumer } from './consumers/activity.consumer.js';
import { registerRealtimeHealthRoutes } from './routes/health.routes.js';
import type { AuthedSocket } from './socket/auth.middleware.js';

const port = Number(process.env.PORT ?? 3005);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters (Section 26).');
}

const app = await createService({
  name: 'realtime-service',
  port,
  jwtSecret,
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
registerRealtimeHealthRoutes(app);

const io = new Server(app.server, {
  cors: { origin: process.env.CORS_ORIGINS },
  transports: ['websocket', 'polling'],
});

io.use(socketAuthMiddleware(jwtSecret));
io.on('connection', (socket) => {
  const authed = socket as AuthedSocket;
  const tenantId = authed.data.user.tenantId;
  const userId = authed.data.user.sub;
  socket.join(tenantRoom(tenantId));
  socket.join(userRoom(userId));
  registerDealSocketHandlers(socket);
  registerNotificationSocketHandlers(socket);
});

try {
  await startDealConsumer(io);
  await startNotificationConsumer(io);
  await startActivityConsumer(io);
  app.log.info('Realtime Kafka consumers started');
} catch (err) {
  app.log.warn({ err }, 'Kafka consumers failed; WebSocket-only mode');
}

await startService(app, port, async () => { /* routes registered above */ });
