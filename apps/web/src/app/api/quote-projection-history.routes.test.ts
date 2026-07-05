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

function mockQuotesFetch() {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ success: true, data: { data: [], total: 0 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// The deals-service quote-projection read-model was decommissioned along with the
// standalone deals-service. Account/contact quote tabs now read finance-service
// (which owns quotes and supports accountId/contactId filters); the deal quote tab
// falls through the deals catch-all to crm-service.
describe('360 quote tab BFF routes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads account quotes from finance-service filtered by accountId', async () => {
    const fetchMock = mockQuotesFetch();
    const route = await import('./accounts/[id]/quotes/route');

    const response = await route.GET(request('/api/accounts/acct-1/quotes?page=2&limit=5'), {
      params: { id: 'acct-1' },
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://finance-service:3002/api/v1/quotes?page=2&limit=5&accountId=acct-1',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('reads contact quotes from finance-service filtered by contactId', async () => {
    const fetchMock = mockQuotesFetch();
    const route = await import('./contacts/[id]/quotes/route');

    const response = await route.GET(request('/api/contacts/contact-1/quotes?limit=10'), {
      params: { id: 'contact-1' },
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://finance-service:3002/api/v1/quotes?limit=10&contactId=contact-1',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('reads deal quotes from crm-service via the deals catch-all proxy', async () => {
    const fetchMock = mockQuotesFetch();
    const route = await import('./deals/[[...path]]/route');

    const response = await route.GET(request('/api/deals/deal-1/quotes?limit=10'), {
      params: { path: ['deal-1', 'quotes'] },
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/deals/deal-1/quotes?limit=10',
      expect.objectContaining({ method: 'GET' })
    );
  });
});
