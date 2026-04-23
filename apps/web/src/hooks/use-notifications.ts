import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  actionUrl?: string | null;
  isRead: boolean;
  createdAt: string;
}

interface PaginatedNotifications {
  data: NotificationItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const notificationKeys = {
  all: ['notifications'] as const,
  list: () => [...notificationKeys.all, 'list'] as const,
  unread: () => [...notificationKeys.all, 'unread'] as const,
};

export function useNotifications(limit = 5) {
  return useQuery<PaginatedNotifications>({
    queryKey: [...notificationKeys.list(), limit],
    queryFn: () =>
      apiClients.notification.get<PaginatedNotifications>('/notifications', {
        params: { page: 1, limit },
      }),
    staleTime: 15_000,
  });
}

export function useUnreadNotificationsCount() {
  return useQuery<{ count: number }>({
    queryKey: notificationKeys.unread(),
    queryFn: () => apiClients.notification.get<{ count: number }>('/notifications/unread-count'),
    staleTime: 15_000,
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation<{ count: number }, Error, void>({
    mutationFn: () => apiClients.notification.post<{ count: number }>('/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
