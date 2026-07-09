import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../services/crm-service/src/server.js';

describe('Integration: CRM Service', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /contacts returns paginated list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/contacts?page=1&pageSize=10',
      headers: { 'x-tenant-id': 'test-tenant' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination).toBeDefined();
  });

  it('POST /deals creates a new deal', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/deals',
      headers: { 'x-tenant-id': 'test-tenant' },
      payload: {
        name: 'Test Deal',
        value: 50000,
        status: 'OPEN',
        ownerId: 'user-1',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.id).toBeDefined();
  });

  it('POST /bulk/contacts creates multiple contacts', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/bulk/contacts',
      headers: { 'x-tenant-id': 'test-tenant' },
      payload: {
        contacts: [
          { email: 'a@example.com', firstName: 'A', lastName: 'B' },
          { email: 'c@example.com', firstName: 'C', lastName: 'D' },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.created).toBe(2);
  });
});
