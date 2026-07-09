/**
 * Derives the test database URL from environment variables.
 * Uses TEST_DATABASE_URL if available; otherwise appends `_test`
 * to the database name extracted from DATABASE_URL.
 */
export function getTestDatabaseUrl(baseEnvVar = 'DATABASE_URL'): string {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (testUrl) return testUrl;

  const baseUrl = process.env[baseEnvVar];
  if (!baseUrl) {
    throw new Error(`${baseEnvVar} or TEST_DATABASE_URL must be set`);
  }

  const url = new URL(baseUrl);
  url.pathname = url.pathname.replace(/\/$/, '') + '_test';
  return url.toString();
}

/**
 * Creates a database client configured for integration tests.
 *
 * @param createClient - factory that receives the test database URL and returns a client
 * @param baseEnvVar - env var name to derive the test DB from (e.g. 'CRM_DATABASE_URL')
 */
export function createTestPrisma<T>(
  createClient: (url: string) => T,
  baseEnvVar = 'DATABASE_URL'
): T {
  const databaseUrl = getTestDatabaseUrl(baseEnvVar);
  return createClient(databaseUrl);
}

/**
 * Truncates all tables in the public schema except `_prisma_migrations`.
 * Resets identity sequences and cascades foreign-key constraints.
 *
 * Requires a prisma client with $queryRaw and $executeRawUnsafe.
 */
export async function resetDatabase(prisma: {
  $queryRaw: <R>(query: TemplateStringsArray, ...values: unknown[]) => Promise<R>;
  $executeRawUnsafe: (query: string) => Promise<unknown>;
}): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename != '_prisma_migrations'
  `;

  if (rows.length === 0) return;

  const tableNames = rows.map((r: { tablename: string }) => `"${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE;`
  );
}

/**
 * Seeds a minimal tenant record for integration tests.
 * Only use this if the Prisma schema has a `tenant` model.
 */
export async function seedTenant(
  prisma: { tenant: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> } },
  tenantId?: string
): Promise<void> {
  await prisma.tenant.create({
    data: {
      id: tenantId ?? 'test-tenant-id',
      slug: 'test-tenant',
      name: 'Test Tenant',
      plan: 'starter',
      isActive: true,
      settings: {},
    },
  });
}
