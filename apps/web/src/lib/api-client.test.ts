import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { useAuthStore } from '@/stores/auth.store';

// Mock toast to avoid console noise
vi.mock('@/lib/toast', () => ({
  notify: { error: vi.fn() },
}));

describe('apiClients', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    server.resetHandlers();
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: '',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should unwrap success envelope and return data', async () => {
    server.use(
      http.get('http://localhost:3001/api/v1/test', () =>
        HttpResponse.json({ success: true, data: { id: '1' } })
      )
    );

    const { apiClients } = await import('./api-client');
    const result = await apiClients.crm.get<{ id: string }>('/test');
    expect(result).toEqual({ id: '1' });
  });

  it('should throw and show toast on API error envelope', async () => {
    const { notify } = await import('@/lib/toast');
    server.use(
      http.get('http://localhost:3001/api/v1/test', () =>
        HttpResponse.json(
          {
            success: false,
            error: { code: 'TEST_ERROR', message: 'Something went wrong' },
          },
          { status: 400 }
        )
      )
    );

    const { apiClients } = await import('./api-client');
    await expect(apiClients.crm.get('/test')).rejects.toBeDefined();
    expect(notify.error).toHaveBeenCalled();
  });

  it('should clear session on 401 when no refresh token', async () => {
    const clearSession = vi.fn();
    // Override getState to return no tokens so the 401 handler falls through to clearSession
    const originalGetState = useAuthStore.getState;
    useAuthStore.getState = () =>
      ({
        accessToken: null,
        refreshToken: null,
        clearSession,
        setAccessToken: vi.fn(),
      } as any);

    server.use(
      http.get('http://localhost:3001/api/v1/test', () =>
        new HttpResponse(null, { status: 401 })
      )
    );

    const { apiClients } = await import('./api-client');
    await expect(apiClients.crm.get('/test')).rejects.toBeDefined();
    expect(clearSession).toHaveBeenCalled();

    // Restore
    useAuthStore.getState = originalGetState;
  });
});
