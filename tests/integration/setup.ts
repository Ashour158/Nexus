/**
 * Integration Test Setup
 *
 * Spins up the test database and ensures required infrastructure
 * is reachable before running integration tests.
 */

import { beforeAll, afterAll } from 'vitest';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://localhost:5432/nexus_test';

beforeAll(async () => {
  console.log('Starting integration test environment...');
  // TODO: start testcontainers or docker compose if not already running
  // Example: await compose.upAll({ cwd: path.join(__dirname), log: true });

  // Verify database connectivity
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('Test database is reachable');
  } catch (err) {
    console.error('Test database is not reachable:', err);
    throw new Error('Integration tests require a running test database. Set TEST_DATABASE_URL or start testcontainers.');
  } finally {
    await prisma.$disconnect();
  }
});

afterAll(async () => {
  console.log('Tearing down integration test environment...');
  // TODO: stop testcontainers or docker compose
  // Example: await compose.down({ cwd: path.join(__dirname), log: true });
});
