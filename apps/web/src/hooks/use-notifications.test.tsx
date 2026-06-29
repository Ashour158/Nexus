import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import {
  useNotifications,
  useUnreadNotificationsCount,
  useMarkNotificationRead,
} from './use-notifications';

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

describe('useNotifications', () => {
  afterEach(() => server.resetHandlers());

  it('returns paginated notifications', async () => {
    server.use(
      http.get('*/notifications', () =>
        HttpResponse.json({
          success: true,
          data: {
            data: [
              {
                id: '1',
                type: 'deal_won',
                title: 'Deal Won',
                body: 'Closed',
                isRead: false,
                createdAt: new Date().toISOString(),
              },
            ],
            total: 1,
            page: 1,
            limit: 5,
            totalPages: 1,
          },
        })
      )
    );

    const { result } = renderHook(() => useNotifications(5), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(1);
    expect(result.current.data?.data[0].title).toBe('Deal Won');
  });

  it('returns unread count', async () => {
    server.use(
      http.get('*/notifications/unread-count', () =>
        HttpResponse.json({ success: true, data: { count: 3 } })
      )
    );

    const { result } = renderHook(() => useUnreadNotificationsCount(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.count).toBe(3);
  });

  it('marks a notification as read', async () => {
    server.use(
      http.patch('*/notifications/:id/read', () =>
        HttpResponse.json({ success: true, data: { id: '1', isRead: true } })
      )
    );

    const { result } = renderHook(() => useMarkNotificationRead(), {
      wrapper: createWrapper(),
    });
    result.current.mutate('1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.isRead).toBe(true);
  });
});
