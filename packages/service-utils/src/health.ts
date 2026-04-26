import type { FastifyInstance } from 'fastify';
import type { Kafka } from 'kafkajs';
import {
  register as promRegister,
  collectDefaultMetrics,
  Counter,
  Histogram,
} from 'prom-client';

collectDefaultMetrics({ prefix: 'nexus_' });

/** Section 48 — Prometheus: total HTTP requests. */
export const httpRequestsTotal = new Counter({
  name: 'nexus_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'service'],
});

/** Section 48 — Prometheus: request duration histogram. */
export const httpRequestDuration = new Histogram({
  name: 'nexus_http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status_code', 'service'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

/** Section 48 — Prometheus: DB query duration histogram. */
export const dbQueryDuration = new Histogram({
  name: 'nexus_db_query_duration_seconds',
  help: 'Database query duration',
  labelNames: ['operation', 'model'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
});

/** Section 48 — single readiness probe result. */
export interface HealthCheck {
  name: string;
  ok: boolean;
  latencyMs?: number;
  message?: string;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  version: string;
  uptime: number;
  timestamp: string;
  checks: {
    name: string;
    status: 'pass' | 'warn' | 'fail';
    responseTime?: number;
    message?: string;
  }[];
}

/** Minimal client shape for `SELECT 1` (any Prisma client). */
export type SqlPingClient = {
  $queryRaw: (args: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
};

/**
 * Section 48 — readiness probe for PostgreSQL via Prisma (or any SQL client).
 */
export async function checkDatabase(prisma: SqlPingClient): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { name: 'database', ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { name: 'database', ok: false, message: String(err) };
  }
}

/** Client with `ping()` — compatible with `ioredis` Redis. */
export type RedisPingClient = { ping: () => Promise<unknown> };

/**
 * Section 48 — readiness probe for Redis.
 */
export async function checkRedis(redis: RedisPingClient): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await redis.ping();
    return { name: 'redis', ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { name: 'redis', ok: false, message: String(err) };
  }
}

/**
 * Section 48 — readiness probe for Kafka (broker listTopics).
 */
export async function checkKafka(kafka: Kafka): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const admin = kafka.admin();
    await admin.connect();
    await admin.listTopics();
    await admin.disconnect();
    return { name: 'kafka', ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { name: 'kafka', ok: false, message: String(err) };
  }
}

/**
 * Section 48 — register `/health` (liveness), `/ready` (readiness), `/metrics` (Prometheus).
 */
export function registerHealthRoutes(
  app: FastifyInstance,
  serviceName: string,
  checkFns: Array<() => Promise<HealthCheck>>
): void {
  app.get('/health', async (_req, reply) => {
    const checks = await Promise.all(checkFns.map((fn) => fn()));
    const hasFail = checks.some((c) => !c.ok);
    const payload: HealthResponse = {
      status: hasFail ? 'degraded' : 'healthy',
      service: serviceName,
      version: process.env.npm_package_version ?? '0.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks: checks.map((c) => ({
        name: c.name,
        status: c.ok ? 'pass' : 'fail',
        responseTime: c.latencyMs,
        message: c.message,
      })),
    };
    reply.code(hasFail ? 503 : 200).send(payload);
  });

  app.get('/ready', async (_req, reply) => {
    const checks = await Promise.all(checkFns.map((fn) => fn()));
    const failCount = checks.filter((c) => !c.ok).length;
    const status: HealthResponse['status'] =
      failCount === 0 ? 'healthy' : failCount === checks.length ? 'unhealthy' : 'degraded';
    const payload: HealthResponse = {
      status,
      service: serviceName,
      version: process.env.npm_package_version ?? '0.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks: checks.map((c) => ({
        name: c.name,
        status: c.ok ? 'pass' : 'fail',
        responseTime: c.latencyMs,
        message: c.message,
      })),
    };
    reply.code(status === 'healthy' ? 200 : 503).send(payload);
  });

  app.get('/metrics', async (_req, reply) => {
    reply.header('Content-Type', promRegister.contentType);
    return promRegister.metrics();
  });
}
