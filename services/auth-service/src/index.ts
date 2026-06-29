import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';

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
import { NexusProducer } from '@nexus/kafka';
import { PrismaClient } from '../../../node_modules/.prisma/auth-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';
import { createAuthPrisma } from './prisma.js';
import { registerAllRoutes } from './routes/index.js';
import { registerGraphQL } from './graphql/index.js';
import { isIpAllowed } from './services/ip-restriction.service.js';
import { JwksKeyStore } from './lib/jwt.js';
import {
  getSigningPrivateKey,
  getCurrentPublicKey,
  getAllPublicKeys,
  storeKeyPair,
} from './jwt-keys.js';

startTracing({ serviceName: 'auth-service' });
const prismaHealth = new PrismaClient({
  datasources: {
    db: {
      url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10 }),
    },
  },
});
const prisma = createAuthPrisma();
const producer = new NexusProducer('auth-service');

const keyStore = new JwksKeyStore({ rotationDays: Number(process.env.JWT_ROTATION_DAYS ?? 90) });

const privatePem = await getSigningPrivateKey();
const publicPem = await getCurrentPublicKey();
if (privatePem && publicPem) {
  const allPublic = await getAllPublicKeys();
  const currentKid = Object.entries(allPublic).find(([, v]) => v === publicPem)?.[0] ?? crypto.randomUUID();
  await keyStore.importKeyPair(currentKid, privatePem, publicPem);
  for (const [kid, pem] of Object.entries(allPublic)) {
    if (kid === currentKid) continue;
    await keyStore.importKeyPair(kid, pem, pem);
  }
} else {
  const kid = await keyStore.generateKeyPair();
  const keyRecord = (keyStore as unknown as { keys: Array<{ kid: string; privateKey: import('node:crypto').KeyLike; publicKey: import('node:crypto').KeyLike; createdAt: Date }> }).keys.at(-1)!;
  const privateKeyPem = (keyRecord.privateKey as import('node:crypto').KeyObject).export({ type: 'pkcs8', format: 'pem' }) as string;
  const publicKeyPem = (keyRecord.publicKey as import('node:crypto').KeyObject).export({ type: 'spki', format: 'pem' }) as string;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (Number(process.env.JWT_ROTATION_DAYS ?? 90) * 24 * 60 * 60 * 1000));
  await storeKeyPair(kid, privateKeyPem, publicKeyPem, now.toISOString(), expiresAt.toISOString());
}

const env = requireEnv(['DATABASE_URL', 'JWT_SECRET']);
const port = Number(optionalEnv('PORT', '3000'));
const jwtSecret = env.JWT_SECRET;

const latestKey = (keyStore as unknown as { keys: Array<{ privateKey: import('node:crypto').KeyLike; publicKey: import('node:crypto').KeyLike }> }).keys.at(-1);
if (!latestKey) throw new Error('No JWT keys available');

const app = await createService({
  name: 'auth-service',
  port,
  jwtSecret,
  jwtPrivateKey: latestKey.privateKey as import('node:crypto').KeyObject,
  jwtPublicKey: latestKey.publicKey as import('node:crypto').KeyObject,
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
  if (routeOptions.url.includes('/users/:slug/availability')) {
    routeOptions.config = {
      ...routeOptions.config,
      rateLimit: { max: 20, timeWindow: '1 minute' },
    };
  }
});

try {
  await producer.connect();
  app.log.info('Kafka producer connected');
} catch (err) {
  app.log.warn({ err }, 'Kafka producer connect failed; continuing without event publishing');
}

app.addHook('onClose', async () => {
  try { await producer.disconnect(); } catch (err) { app.log.warn({ err }, 'Producer disconnect failed'); }
});

// JWKS public endpoint — consumed by all other services for JWT verification
app.get('/.well-known/jwks.json', async (_request, reply) => {
  return reply.send(await keyStore.getJwks());
});

app.addHook('preHandler', async (request, reply) => {
  const user = (request as any).user as { tenantId?: string } | undefined;
  if (!user?.tenantId) return; // unauthenticated routes — skip IP check
  try {
    const ip = request.ip;
    const result = await isIpAllowed(prisma, user.tenantId, ip);
    if (!result.allowed) {
      return reply.code(403).send({ success: false, error: { code: 'IP_RESTRICTED', message: result.reason ?? 'Access denied by IP restriction policy' } });
    }
  } catch {
    // fail-open: any error allows the request through
  }
});

await registerAllRoutes(app, prisma, producer, keyStore);
await registerGraphQL(app, prisma, keyStore);

await startService(app, port, async () => {
  await prisma.$disconnect();
  await prismaHealth.$disconnect();
});
