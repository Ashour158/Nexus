import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';

export interface ProfileData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  timezone?: string | null;
  locale?: string | null;
  avatarUrl?: string | null;
  profile?: {
    jobTitle?: string | null;
    personalPhone?: string | null;
    notificationPrefs?: Record<string, unknown>;
    dashboardLayout?: Record<string, unknown>;
  } | null;
  userRoles?: Array<{ role: { id: string; name: string } }>;
}

export const profileKeys = {
  all: ['profile'] as const,
  detail: () => [...profileKeys.all, 'me'] as const,
};

export function useProfile() {
  return useQuery<ProfileData>({
    queryKey: profileKeys.detail(),
    queryFn: () => apiClients.auth.get<ProfileData>('/profile/me'),
    staleTime: 60_000,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation<
    ProfileData,
    Error,
    Partial<{
      firstName: string;
      lastName: string;
      phone: string;
      locale: string;
      timezone: string;
      avatarUrl: string;
      notificationPrefs: Record<string, unknown>;
      dashboardLayout: Record<string, unknown>;
    }>
  >({
    mutationFn: (data) => apiClients.auth.put<ProfileData>('/profile/me', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: profileKeys.all });
      notify.success('Profile updated');
    },
    onError: (err) => {
      notify.error('Failed to update profile', err.message);
    },
  });
}
