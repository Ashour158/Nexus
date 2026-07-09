/**
 * Prisma connection-string helper with connection-limit defaults for PgBouncer
 * and optional read replica support.
 *
 * Usage (in a service):
 *   import { buildDatabaseUrl } from '@nexus/service-utils/db';
 *   const prisma = new PrismaClient({
 *     datasources: { db: { url: buildDatabaseUrl({ connectionLimit: 5 }) } }
 *   });
 */

export interface DatabaseUrlOptions {
  connectionLimit?: number;
  poolTimeout?: number;
  pgbouncer?: boolean;
  /** Override the base DATABASE_URL */
  databaseUrl?: string;
}

/** Recommended connection limit per Prisma instance when PgBouncer is NOT used.
 *  PostgreSQL max_connections defaults to 100. With 30+ services each creating
 *  2 Prisma clients (read + write), a limit of 5 exhausts the pool immediately.
 *  Use PgBouncer (transaction mode) in production, or set this to 2-3.
 */
export const RECOMMENDED_CONNECTION_LIMIT = Number(process.env.DATABASE_CONNECTION_LIMIT ?? 3);

export function buildDatabaseUrl(opts: DatabaseUrlOptions = {}): string {
  const {
    connectionLimit = RECOMMENDED_CONNECTION_LIMIT,
    poolTimeout = Number(process.env.DATABASE_POOL_TIMEOUT ?? 10),
    pgbouncer = process.env.DATABASE_PGBOUNCER === 'true',
    databaseUrl = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/nexus',
  } = opts;

  const url = new URL(databaseUrl);
  const params = new URLSearchParams(url.search);
  params.set('connection_limit', String(connectionLimit));
  params.set('pool_timeout', String(poolTimeout));
  if (pgbouncer) {
    params.set('pgbouncer', 'true');
  }
  url.search = params.toString();
  return url.toString();
}

/** Build read replica URL from DATABASE_READ_REPLICA_URL or fallback to main DB. */
export function buildReadReplicaUrl(opts: Omit<DatabaseUrlOptions, 'databaseUrl'> = {}): string {
  const replicaUrl = process.env.DATABASE_READ_REPLICA_URL ?? process.env.DATABASE_URL;
  return buildDatabaseUrl({ ...opts, databaseUrl: replicaUrl });
}

/** Graceful disconnect helper for Prisma clients. */
export function attachGracefulDisconnect(prisma: { $on: (event: string, cb: () => Promise<void>) => void; $disconnect: () => Promise<void> }): void {
  prisma.$on('beforeExit', async () => {
    await prisma.$disconnect();
  });
}

export interface SlowQueryEvent {
  query: string;
  duration: number;
}

/**
 * Attach slow-query logging to a Prisma client.
 * Queries exceeding `thresholdMs` (default 500 ms) are logged as warnings.
 * Requires the PrismaClient to be instantiated with `log: [{ emit: 'event', level: 'query' }]`.
 */
export function attachSlowQueryLog(
  prisma: { $on: (event: 'query', cb: (e: SlowQueryEvent) => void) => void },
  serviceName: string,
  thresholdMs = 500
): void {
  prisma.$on('query', (e) => {
    if (e.duration >= thresholdMs) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          service: serviceName,
          msg: 'slow_query',
          durationMs: e.duration,
          query: e.query.slice(0, 300),
        })
      );
    }
  });
}
