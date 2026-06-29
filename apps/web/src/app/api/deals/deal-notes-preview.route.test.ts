import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function request(path: string) {
  return new NextRequest(`http://localhost${path}`, {
    headers: { authorization: 'Bearer dev-preview-token' },
  });
}

describe('deal notes preview BFF route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_DEV_AUTH_BYPASS', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns a stable empty notes page from existing dev-preview deal routing', async () => {
    const route = await import('./[[...path]]/route');

    const response = await route.GET(
      request('/api/deals/deal-nova-proposal/notes?page=1&limit=50'),
      { params: { path: ['deal-nova-proposal', 'notes'] } }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      data: [],
      total: 0,
      page: 1,
      limit: 50,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    });
  });

  it('preserves pagination parameters for missing preview notes', async () => {
    const route = await import('./[[...path]]/route');

    const response = await route.GET(
      request('/api/deals/deal-nova-proposal/notes?page=2&limit=10'),
      { params: { path: ['deal-nova-proposal', 'notes'] } }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.page).toBe(2);
    expect(body.data.limit).toBe(10);
  });

  it('sanitizes unavailable upstream service errors outside dev preview', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_DEV_AUTH_BYPASS', 'false');
    vi.stubEnv('CRM_SERVICE_URL', 'http://crm-service.invalid');
    const fetchMock = vi.fn(async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:3001');
    });
    vi.stubGlobal('fetch', fetchMock);
    const route = await import('./[[...path]]/route');

    const response = await route.GET(
      request('/api/deals/deal-nova-proposal/notes?page=1&limit=50'),
      { params: { path: ['deal-nova-proposal', 'notes'] } }
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://crm-service.invalid/api/v1/deals/deal-nova-proposal/notes?page=1&limit=50',
      expect.objectContaining({
        headers: expect.not.objectContaining({
          'x-internal-service-token': expect.any(String),
        }),
      })
    );
  });
});
