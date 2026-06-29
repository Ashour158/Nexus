import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';
import { profileKeys } from './use-profile';

export interface NotificationPrefs {
  dealWon?: boolean;
  dealLost?: boolean;
  taskDue?: boolean;
  newLead?: boolean;
  emailOpen?: boolean;
  callMissed?: boolean;
  weeklyDigest?: boolean;
  systemAlerts?: boolean;
}

export const notificationSettingsKeys = {
  all: ['notification-settings'] as const,
};

export function useNotificationSettings() {
  return useQuery<NotificationPrefs>({
    queryKey: notificationSettingsKeys.all,
    queryFn: async () => {
      const data = await apiClients.auth.get<{
        profile?: { notificationPrefs?: NotificationPrefs } | null;
      }>('/profile/me');
      return data.profile?.notificationPrefs ?? {};
    },
    staleTime: 60_000,
  });
}

export function useUpdateNotificationSettings() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, NotificationPrefs>({
    mutationFn: (prefs) =>
      apiClients.auth.put('/profile/me', { notificationPrefs: prefs }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: profileKeys.all });
      qc.invalidateQueries({ queryKey: notificationSettingsKeys.all });
      notify.success('Notification preferences saved');
    },
    onError: (err) => {
      notify.error('Failed to save preferences', err.message);
    },
  });
}
