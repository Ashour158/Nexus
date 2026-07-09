import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function request(path: string) {
  return new NextRequest(`http://localhost${path}`, {
    headers: { authorization: 'Bearer dev-preview-token' },
  });
}

describe('RFQ preview BFF routes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_DEV_AUTH_BYPASS', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('loads RFQ detail from existing dev-preview data', async () => {
    const route = await import('./[id]/route');

    const response = await route.GET(request('/api/finance/rfqs/rfq-nova-cx'), {
      params: { id: 'rfq-nova-cx' },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.rfqNumber).toBe('RFQ-2026-000003');
    expect(body.data.convertedQuoteId).toBe('quote-nova-cpq-v1');
  });

  it('returns a stable not-found envelope for missing preview RFQs', async () => {
    const route = await import('./[id]/route');

    const response = await route.GET(request('/api/finance/rfqs/missing-rfq'), {
      params: { id: 'missing-rfq' },
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
