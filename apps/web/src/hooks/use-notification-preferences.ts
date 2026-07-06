import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { notify } from '@/lib/toast';

/**
 * Per-channel notification preferences (NOT-11).
 *
 * Talks to the Next BFF proxy at `/api/notifications/preferences`, which
 * auth-forwards to notification-service. The effective map defaults every
 * channel to enabled (opt-out model); a user only ever toggles their own prefs.
 */

export const NOTIFICATION_CHANNELS = [
  'IN_APP',
  'EMAIL',
  'SMS',
  'PUSH',
  'WHATSAPP',
] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type ChannelPreferences = Record<NotificationChannel, boolean>;

const DEFAULT_PREFS: ChannelPreferences = {
  IN_APP: true,
  EMAIL: true,
  SMS: true,
  PUSH: true,
  WHATSAPP: true,
};

export const notificationPreferenceKeys = {
  all: ['notification-preferences'] as const,
};

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export function useNotificationPreferences() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery<ChannelPreferences>({
    queryKey: notificationPreferenceKeys.all,
    queryFn: async () => {
      const res = await fetch('/api/notifications/preferences', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => ({}))) as Envelope<ChannelPreferences>;
      return { ...DEFAULT_PREFS, ...(json.data ?? {}) };
    },
    staleTime: 60_000,
  });
}

export function useUpdateNotificationPreference() {
  const token = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation<
    ChannelPreferences,
    Error,
    { channel: NotificationChannel; enabled: boolean }
  >({
    mutationFn: async ({ channel, enabled }) => {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ channel, enabled }),
      });
      const json = (await res.json().catch(() => ({}))) as Envelope<ChannelPreferences>;
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? 'Failed to save preference');
      }
      return { ...DEFAULT_PREFS, ...(json.data ?? {}) };
    },
    onMutate: async ({ channel, enabled }) => {
      await qc.cancelQueries({ queryKey: notificationPreferenceKeys.all });
      const previous = qc.getQueryData<ChannelPreferences>(
        notificationPreferenceKeys.all
      );
      if (previous) {
        qc.setQueryData<ChannelPreferences>(notificationPreferenceKeys.all, {
          ...previous,
          [channel]: enabled,
        });
      }
      return { previous };
    },
    onError: (err, _vars, context) => {
      const previous = (context as { previous?: ChannelPreferences } | undefined)?.previous;
      if (previous) {
        qc.setQueryData(notificationPreferenceKeys.all, previous);
      }
      notify.error('Failed to save preference', err.message);
    },
    onSuccess: (data) => {
      qc.setQueryData(notificationPreferenceKeys.all, data);
      notify.success('Notification preference saved');
    },
  });
}
