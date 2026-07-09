import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';

export const mfaKeys = {
  all: ['mfa'] as const,
  status: () => [...mfaKeys.all, 'status'] as const,
};

export function useMfaStatus() {
  return useQuery<{ enabled: boolean }>({
    queryKey: mfaKeys.status(),
    queryFn: () => apiClients.auth.get<{ enabled: boolean }>('/auth/mfa/status'),
    staleTime: 30_000,
  });
}

export function useSetupMfa() {
  return useMutation<
    { qrCodeUrl: string; secret: string; backupCodes: string[] },
    Error,
    void
  >({
    mutationFn: () => apiClients.auth.post('/auth/mfa/setup'),
    onSuccess: () => {
      notify.success('MFA setup initiated');
    },
    onError: (err) => {
      notify.error('Failed to set up MFA', err.message);
    },
  });
}

export function useEnableMfa() {
  const qc = useQueryClient();
  return useMutation<{ enabled: boolean }, Error, { code: string }>({
    mutationFn: ({ code }) =>
      apiClients.auth.post('/auth/mfa/enable', { code }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mfaKeys.all });
      notify.success('MFA enabled');
    },
    onError: (err) => {
      notify.error('Failed to enable MFA', err.message);
    },
  });
}

export function useDisableMfa() {
  const qc = useQueryClient();
  return useMutation<{ disabled: boolean }, Error, { code: string }>({
    mutationFn: ({ code }) =>
      apiClients.auth.post('/auth/mfa/disable', { code }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mfaKeys.all });
      notify.success('MFA disabled');
    },
    onError: (err) => {
      notify.error('Failed to disable MFA', err.message);
    },
  });
}
