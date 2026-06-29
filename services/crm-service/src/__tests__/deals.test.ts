import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildServer } from '../server.js';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

let app: Awaited<ReturnType<typeof buildServer>>['app'];

beforeAll(async () => {
  const result = await buildServer();
  app = result.app;
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('GET /deals', () => {
  it('returns list of deals with 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/deals',
      headers: { 'x-tenant-id': 'test-tenant' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('returns 400 without tenant header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/deals',
    });
    expect(res.statusCode).toBe(400);
  });
});
