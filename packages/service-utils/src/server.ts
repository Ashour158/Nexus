import Fastify, { type FastifyInstance, type RawServerDefault } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import { fastifyRequestContext } from '@fastify/request-context';
import pino from 'pino';
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.05,
    environment: process.env.NODE_ENV ?? 'development',
  });
}

export interface ServiceConfig {
  name: string;
  port: number;
  jwtSecret: string;
  corsOrigins: string[];
  enableMultipart?: boolean;
}

function pathOnly(url: string): string {
  const i = url.indexOf('?');
  return i === -1 ? url : url.slice(0, i);
}

/** Routes that skip JWT verification (Section 35 + public auth flows). */
function isPublicRoute(url: string, method: string): boolean {
  const path = pathOnly(url);
  if (path.startsWith('/health') || path.startsWith('/metrics') || path.startsWith('/ready')) {
    return true;
  }
  /** Public comm-service email open/click tracking (no JWT on pixel / webhook). */
  if (path.startsWith('/api/v1/webhooks/')) {
    return true;
  }
  /** Public billing catalog + Stripe webhooks. */
  if (method === 'GET' && path === '/api/v1/billing/plans') {
    return true;
  }
  if (method === 'POST' && path === '/api/v1/billing/webhooks/stripe') {
    return true;
  }
  /** CRM → blueprint transition check (service token + tenant header; no end-user JWT). */
  if (method === 'POST' && path === '/api/v1/blueprints/internal/validate-transition') {
    return true;
  }
  if (
    method === 'POST' &&
    (path === '/api/v1/auth/login' ||
      path === '/api/v1/auth/refresh' ||
      path === '/api/v1/auth/forgot-password' ||
      path === '/api/v1/auth/reset-password')
  ) {
    return true;
  }
  return false;
}

/** Section 35 — Fastify Service Bootstrap (plugins, JWT, hooks; health via Section 48 `registerHealthRoutes`). */
export async function createService(config: ServiceConfig): Promise<FastifyInstance<RawServerDefault>> {
  const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport:
      process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  });

  const app = Fastify({
    logger,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    trustProxy: true,
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
  });

  await app.register(fastifyCors, {
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id'],
  });

  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
    sign: { algorithm: 'HS256' },
  });

  if (config.enableMultipart) {
    await app.register(fastifyMultipart, {
      limits: { fileSize: 100 * 1024 * 1024 },
    });
  }

  await app.register(fastifyRequestContext, {
    defaultStoreValues: () => ({ tenantId: '', userId: '', requestId: '' }),
  });

  app.addHook('onRequest', async (request) => {
    (request.requestContext as { set: (key: string, value: string) => void }).set('requestId', request.id);
  });

  app.addHook('preHandler', async (request, reply) => {
    if (isPublicRoute(request.url, request.method)) return;

    try {
      await request.jwtVerify();
      const payload = request.user as { tenantId: string; sub: string };
      const ctx = request.requestContext as { set: (key: string, value: string) => void };
      ctx.set('tenantId', payload.tenantId);
      ctx.set('userId', payload.sub);
    } catch {
      return reply.code(401).send({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
      });
    }
  });

  return app as unknown as FastifyInstance<RawServerDefault>;
}

/**
 * Listen on `port` after `registerRoutes`, and register graceful shutdown on SIGINT / SIGTERM.
 */
export async function startService(
  app: FastifyInstance<RawServerDefault>,
  port: number,
  registerRoutes: (app: FastifyInstance<RawServerDefault>) => Promise<void>
): Promise<void> {
  await registerRoutes(app);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Service listening on port ${port}`);

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, async () => {
      app.log.info(`${signal} received, shutting down`);
      await app.close();
      process.exit(0);
    });
  }
}
