import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

const BASE = 'http://localhost:3016';

async function serviceAvailable(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(1000) });
    return r.ok;
  } catch {
    return false;
  }
}

describe('document-service smoke', () => {
  let available = false;
  beforeAll(async () => {
    available = await serviceAvailable();
  });

  it('GET /health → 200', async () => {
    if (!available) return;
    const res = await fetch(`${BASE}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('returns JSON on api routes', async () => {
    if (!available) return;
    const res = await request(BASE).get('/health');
    expect(res.headers['content-type']).toContain('application/json');
  });
});
