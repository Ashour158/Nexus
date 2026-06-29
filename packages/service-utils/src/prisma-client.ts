import { buildDatabaseUrl } from './db.js';

export interface PrismaReplicaOptions {
  /** Explicit write URL (falls back to DATABASE_URL env var). */
  writeUrl?: string;
  /** Explicit read-replica URL (falls back to DATABASE_READ_REPLICA_URL env var). */
  readReplicaUrl?: string;
  connectionLimit?: number;
  poolTimeout?: number;
  pgbouncer?: boolean;
}

/**
 * Creates a Prisma client with an attached `$read` replica client.
 *
 * If `readReplicaUrl` (or the `DATABASE_READ_REPLICA_URL` env var) is not
 * configured, `$read` points to the same write client so callers can always
 * use `prisma.$read` for read operations.
 *
 * Usage:
 *   const prisma = createPrismaClientWithReplicas(
 *     (url) => new PrismaClient({ datasources: { db: { url } } }),
 *     { readReplicaUrl: process.env.DATABASE_READ_REPLICA_URL }
 *   );
 *   // writes
 *   await prisma.user.create({ data: { ... } });
 *   // reads
 *   await prisma.$read.user.findMany({ ... });
 */
export function createPrismaClientWithReplicas<T extends { $disconnect(): Promise<void> }>(
  createClient: (url: string) => T,
  opts: PrismaReplicaOptions = {}
): T & { $read: T } {
  const writeUrl = buildDatabaseUrl({
    databaseUrl: opts.writeUrl,
    connectionLimit: opts.connectionLimit,
    poolTimeout: opts.poolTimeout,
    pgbouncer: opts.pgbouncer,
  });

  const readReplicaUrl = opts.readReplicaUrl ?? process.env.DATABASE_READ_REPLICA_URL;
  const readUrl = readReplicaUrl
    ? buildDatabaseUrl({
        databaseUrl: readReplicaUrl,
        connectionLimit: opts.connectionLimit,
        poolTimeout: opts.poolTimeout,
        pgbouncer: opts.pgbouncer,
      })
    : writeUrl;

  const write = createClient(writeUrl);
  const read = readUrl === writeUrl ? write : createClient(readUrl);

  (write as any).$read = read;
  return write as T & { $read: T };
}
