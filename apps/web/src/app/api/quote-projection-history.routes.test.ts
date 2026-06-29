import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

function request(path: string) {
  return new NextRequest(`http://localhost${path}`, {
    headers: {
      authorization: 'Bearer user-token',
      'x-tenant-id': 'tenant-1',
    },
  });
}

function mockProjectionFetch() {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ success: true, data: { data: [], total: 0 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('quote history projection BFF routes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads account quote history from deals-service QuoteProjection', async () => {
    const fetchMock = mockProjectionFetch();
    const route = await import('./accounts/[id]/quotes/route');

    const response = await route.GET(request('/api/accounts/acct-1/quotes?page=2&limit=5'), {
      params: { id: 'acct-1' },
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3042/api/v1/data/quote-projections/account/acct-1?page=2&limit=5',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('reads contact quote history from deals-service QuoteProjection', async () => {
    const fetchMock = mockProjectionFetch();
    const route = await import('./contacts/[id]/quotes/route');

    const response = await route.GET(request('/api/contacts/contact-1/quotes?limit=10'), {
      params: { id: 'contact-1' },
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3042/api/v1/data/quote-projections/contact/contact-1?limit=10',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('reads deal quote history from deals-service QuoteProjection instead of CRM quote tables', async () => {
    const fetchMock = mockProjectionFetch();
    const route = await import('./deals/[[...path]]/route');

    const response = await route.GET(request('/api/deals/deal-1/quotes?limit=10'), {
      params: { path: ['deal-1', 'quotes'] },
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3042/api/v1/data/quote-projections/deal/deal-1?limit=10',
      expect.objectContaining({ cache: 'no-store' })
    );
  });
});
