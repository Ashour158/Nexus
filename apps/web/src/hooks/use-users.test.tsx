import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { useUsers, useRoles } from './use-users';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('useUsers', () => {
  afterEach(() => server.resetHandlers());

  it('returns paginated users', async () => {
    server.use(
      http.get('*/users', ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('page')).toBe('1');
        expect(url.searchParams.get('limit')).toBe('100');
        return HttpResponse.json({
          success: true,
          data: {
            data: [
              {
                id: 'u1',
                firstName: 'Jane',
                lastName: 'Doe',
                email: 'jane@example.com',
                isActive: true,
              },
            ],
            total: 1,
            page: 1,
            limit: 100,
            totalPages: 1,
          },
        });
      })
    );

    const { result } = renderHook(() => useUsers(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(1);
    expect(result.current.data?.data[0].firstName).toBe('Jane');
  });

  it('returns roles', async () => {
    server.use(
      http.get('*/roles', () =>
        HttpResponse.json({
          success: true,
          data: {
            data: [{ id: 'r1', name: 'Admin', isSystem: true }],
            total: 1,
            page: 1,
            limit: 200,
            totalPages: 1,
          },
        })
      )
    );

    const { result } = renderHook(() => useRoles(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data[0].name).toBe('Admin');
  });
});
