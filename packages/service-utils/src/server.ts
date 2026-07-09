import Fastify, { type FastifyInstance, type RawServerDefault } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import { fastifyRequestContext } from '@fastify/request-context';
import { createRedisClient } from './redis.js';
import pino from 'pino';
import * as Sentry from '@sentry/node';
import { type KeyObject } from 'node:crypto';
// JWKS resolution is shared with the standalone GraphQL/context verifier so REST
// and GraphQL enforce exactly the same trust model against one keyset cache.
import { resolveJwksPublicKey } from './verify-token.js';

/** Pull the raw JWT out of the request's Authorization: Bearer header. */
function rawBearerToken(request: { headers?: Record<string, unknown> }): string {
  const auth = (request.headers?.authorization as string | undefined) ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  if (!token) throw new Error('Missing bearer token');
  return token;
}


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
  /** When provided, fastify-jwt is configured to fetch JWKS from this URL instead of a static secret. */
  jwksUrl?: string;
  /** Optional RS256 private key for JWT signing (overrides static secret). PEM string or KeyObject. */
  jwtPrivateKey?: KeyObject | string;
  /** Optional RS256 public key for JWT verification (used with jwtPrivateKey). PEM string or KeyObject. */
  jwtPublicKey?: KeyObject | string;
  /** Additional URL prefixes that should skip JWT verification. */
  publicPrefixes?: string[];
}

function pathOnly(url: string): string {
  const i = url.indexOf('?');
  return i === -1 ? url : url.slice(0, i);
}

/**
 * Internal service-to-service routes self-authenticate via `x-service-token`
 * (INTERNAL_SERVICE_TOKEN) inside the route handler, so they must bypass the
 * global end-user JWT preHandler. This bypass is DELIBERATELY narrow:
 *
 *  - Only paths under `/api/v1/internal/` or `/internal/` qualify, AND
 *  - the request MUST carry an `x-service-token` header that matches the
 *    configured `INTERNAL_SERVICE_TOKEN`.
 *
 * A request to an internal route WITHOUT a matching service token is NOT
 * bypassed here — it falls through to normal JWT verification (and is rejected
 * with 401 if it also lacks a valid user JWT). We never open internal routes to
 * the unauthenticated public: if `INTERNAL_SERVICE_TOKEN` is unset, this always
 * returns false. Token comparison mirrors finance-service `verifyServiceToken`.
 */
function isInternalServiceRoute(url: string, headers: Record<string, unknown> | undefined): boolean {
  const path = pathOnly(url);
  if (!(path.startsWith('/api/v1/internal/') || path.startsWith('/internal/'))) {
    return false;
  }
  const token = headers?.['x-service-token'];
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  return Boolean(expected && typeof token === 'string' && token === expected);
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
  /** WhatsApp Cloud API — Meta status webhook (no JWT). */
  if (method === 'POST' && path === '/api/v1/whatsapp/webhook/status') {
    return true;
  }
  /** Public scheduling — user availability lookup (rate-limited, no JWT). */
  if (method === 'GET' && /^\/api\/v1\/users\/[^/]+\/availability$/.test(path)) {
    return true;
  }
  /** Public meeting booking via scheduler token (validated against User.bookingToken). */
  if (method === 'POST' && path === '/api/v1/activities/public-meeting') {
    return true;
  }
  /** Public booking token validation (used by CRM to verify scheduler tokens). */
  if (method === 'GET' && /^\/api\/v1\/users\/by-booking-token\/.+/.test(path)) {
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
      path === '/api/v1/auth/reset-password' ||
      /^\/api\/v1\/auth\/saml\/callback\/.+/.test(path))
  ) {
    return true;
  }
  if (method === 'GET' && (/^\/api\/v1\/auth\/saml\/metadata/.test(path) || /^\/api\/v1\/auth\/saml\/login\/.+/.test(path))) {
    return true;
  }
  /** JWKS public endpoint */
  if (method === 'GET' && path === '/.well-known/jwks.json') {
    return true;
  }
  /** Service-to-service (verify `x-service-token` in-route). */
  if (path.startsWith('/api/v1/internal/reporting')) {
    return true;
  }
  if (path.startsWith('/api/v1/internal/outbox')) {
    return true;
  }
  if (path.startsWith('/api/v1/internal/codes')) {
    return true;
  }
  /** CRM public deal room (buyer link; no JWT). */
  if (method === 'GET' && /^\/api\/v1\/deal-rooms\/[^/]+\/public$/.test(path)) {
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
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'", 'https:'],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
  });

  await app.register(fastifyCookie, {
    secret: config.jwtSecret,
    parseOptions: {},
  });

  const isProd = process.env.NODE_ENV === 'production';
  const safeOrigins = config.corsOrigins.filter((o) => {
    if (isProd && (o.includes('localhost') || o.includes('127.0.0.1'))) {
      app.log.warn({ origin: o }, 'Stripping localhost from CORS origins in production');
      return false;
    }
    return true;
  });

  await app.register(fastifyCors, {
    origin: safeOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id', 'X-Service-Token', 'Idempotency-Key', 'X-Request-Id'],
  });

  // JWKS URL may be provided explicitly or via AUTH_JWKS_URL env (so services can
  // opt into verifying auth-service's RS256 tokens without a code change).
  const jwksUrl = config.jwksUrl ?? process.env.AUTH_JWKS_URL;
  if (config.jwtPrivateKey && config.jwtPublicKey) {
    await app.register(fastifyJwt as any, {
      secret: { private: config.jwtPrivateKey, public: config.jwtPublicKey },
      sign: { algorithm: 'RS256' },
    });
  } else if (jwksUrl) {
    await app.register(fastifyJwt as any, {
      // fast-jwt hands the secret callback only the decoded payload (no header),
      // so read the raw token off the request to recover its `kid`.
      secret: (request: any) => resolveJwksPublicKey(jwksUrl, rawBearerToken(request)),
      verify: { algorithms: ['RS256'] },
    });
  } else {
    await app.register(fastifyJwt as any, {
      secret: config.jwtSecret,
      sign: { algorithm: 'HS256' },
    });
  }

  if (config.enableMultipart) {
    await app.register(fastifyMultipart, {
      limits: { fileSize: 100 * 1024 * 1024 },
    });
  }

  // Rate limiting (Section 35) — memory store by default; Redis when available for distributed consistency
  const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10);
  const rateLimitWindow = process.env.RATE_LIMIT_WINDOW ?? '1 minute';
  try {
    const redis = process.env.REDIS_URL ? createRedisClient() : undefined;
    await app.register(fastifyRateLimit as any, {
      max: rateLimitMax,
      timeWindow: rateLimitWindow,
      redis: redis,
      skipOnError: true,
      // Never rate-limit infra probes: liveness/readiness health checks and
      // Prometheus /metrics scrapes all originate from a single IP with no JWT,
      // so they share one bucket and would trip the limit — starving the probe
      // and marking the container unhealthy (→ restart loops under an orchestrator).
      allowList: (req: any) => {
        const path = pathOnly(req.url);
        return path.startsWith('/health') || path.startsWith('/metrics') || path.startsWith('/ready');
      },
      keyGenerator: (req: any) => {
        const tenantId = req.headers['x-tenant-id'] as string | undefined;
        // Extract user sub from JWT payload (no signature verification needed for bucketing)
        let userId: string | undefined;
        const auth = req.headers.authorization as string | undefined;
        if (auth?.startsWith('Bearer ')) {
          try {
            const payload = JSON.parse(Buffer.from(auth.split('.')[1], 'base64url').toString());
            userId = payload.sub;
          } catch { /* ignore malformed JWT */ }
        }
        // Per-tenant per-user bucket when identifiable; fallback to IP
        if (tenantId && userId) return `${tenantId}:${userId}`;
        if (tenantId) return `${tenantId}:${req.ip}`;
        return req.ip;
      },
      errorResponseBuilder: (_req: any, context: any) => ({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: `Rate limit exceeded. Retry after ${context.after}.`,
        },
      }),
    });
  } catch (err) {
    app.log.warn({ err }, 'Failed to register rate-limit plugin; continuing without rate limiting');
  }

  await app.register(fastifyRequestContext, {
    defaultStoreValues: () => ({ tenantId: '', userId: '', requestId: '' }),
  });

  app.addHook('onRequest', async (request) => {
    (request.requestContext as { set: (key: string, value: string) => void }).set('requestId', request.id);
    // Extract and propagate distributed trace context
    const traceparent = request.headers['traceparent'] as string | undefined;
    if (traceparent) {
      (request.requestContext as { set: (key: string, value: string) => void }).set('traceparent', traceparent);
    }
  });

  // Section 35 — API Versioning + Rate Limiting + Security headers on every response
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-API-Version', 'v1');
    // NOTE: Rate-limit headers are set by @fastify/rate-limit when active.
    // Do NOT emit fake headers — they break client backoff logic and monitoring.
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    return payload;
  });

  app.addHook('preHandler', async (request, reply) => {
    const path = pathOnly(request.url);
    if (isPublicRoute(path, request.method)) return;
    // Internal service-to-service routes self-verify `x-service-token` in-route;
    // bypass the end-user JWT preHandler ONLY when a matching token is present.
    // Without the token this falls through to JWT verification below.
    if (isInternalServiceRoute(path, request.headers as Record<string, unknown>)) return;
    if (config.publicPrefixes?.some((prefix) => path.startsWith(prefix))) return;

    try {
      await request.jwtVerify();
      const payload = request.user as { tenantId: string; sub: string };
      const ctx = request.requestContext as { set: (key: string, value: string) => void };
      ctx.set('tenantId', payload.tenantId);
      ctx.set('userId', payload.sub);
    } catch {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token',
          requestId: request.id,
        },
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
  // API versions discovery endpoint (Section 35)
  app.get('/api/versions', async (_request, reply) => {
    reply.header('Cache-Control', 'public, max-age=300');
    return {
      success: true,
      data: {
        current: 'v1',
        versions: [
          { version: 'v1', status: 'active' as const, docsUrl: '/docs' },
        ],
      },
    };
  });

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
