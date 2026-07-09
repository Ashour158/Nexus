import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';

/**
 * React Query hooks for per-user Mail Accounts (Settings) — comm-service.
 *
 * Owner-scoped: every endpoint reads/writes only the caller's own accounts.
 * Delegates to `apiClients.comms` (base → comm-service `/api/v1`). Responses are
 * secret-masked ({ host, port, secure, username, hasPassword }) — plaintext
 * credentials are never returned.
 */

export type MailProvider = 'SMTP' | 'GMAIL' | 'OUTLOOK';

export interface MailAccountSmtpView {
  host: string | null;
  port: number | null;
  secure: boolean | null;
  username: string | null;
  hasPassword: boolean;
}

export interface MailAccountOAuthView {
  connected: boolean;
  expiresAt: string | null;
}

export interface MailAccount {
  id: string;
  tenantId: string;
  userId: string;
  provider: MailProvider;
  displayName: string;
  fromEmail: string;
  fromName: string | null;
  isDefault: boolean;
  isActive: boolean;
  verifiedAt: string | null;
  lastError: string | null;
  smtp: MailAccountSmtpView | null;
  oauth: MailAccountOAuthView | null;
  createdAt: string;
  updatedAt: string;
}

export interface SmtpConfigInput {
  host: string;
  port: number;
  secure?: boolean;
  username?: string;
  password?: string;
}

export interface CreateMailAccountInput {
  provider: MailProvider;
  displayName: string;
  fromEmail: string;
  fromName?: string;
  isDefault?: boolean;
  smtp?: SmtpConfigInput;
}

export interface UpdateMailAccountInput {
  displayName?: string;
  fromName?: string;
  isActive?: boolean;
  smtp?: SmtpConfigInput;
}

export interface VerifyResult {
  verified: boolean;
  account: MailAccount;
}

export const mailAccountKeys = {
  all: ['mail-accounts'] as const,
  list: () => [...mailAccountKeys.all, 'list'] as const,
};

export function useMailAccounts() {
  return useQuery<MailAccount[]>({
    queryKey: mailAccountKeys.list(),
    queryFn: () => apiClients.comms.get<MailAccount[]>('/mail-accounts'),
    staleTime: 30_000,
  });
}

export function useCreateMailAccount() {
  const qc = useQueryClient();
  return useMutation<MailAccount, Error, CreateMailAccountInput>({
    mutationFn: (data) => apiClients.comms.post<MailAccount>('/mail-accounts', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mailAccountKeys.all });
      notify.success('Mail account added');
    },
    onError: (err) => notify.error('Failed to add mail account', err.message),
  });
}

export function useUpdateMailAccount() {
  const qc = useQueryClient();
  return useMutation<MailAccount, Error, { id: string; data: UpdateMailAccountInput }>({
    mutationFn: ({ id, data }) => apiClients.comms.patch<MailAccount>(`/mail-accounts/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mailAccountKeys.all });
      notify.success('Mail account updated');
    },
    onError: (err) => notify.error('Failed to update mail account', err.message),
  });
}

export function useDeleteMailAccount() {
  const qc = useQueryClient();
  return useMutation<{ id: string; deleted: boolean }, Error, string>({
    mutationFn: (id) => apiClients.comms.delete<{ id: string; deleted: boolean }>(`/mail-accounts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mailAccountKeys.all });
      notify.success('Mail account removed');
    },
    onError: (err) => notify.error('Failed to remove mail account', err.message),
  });
}

export function useSetDefaultMailAccount() {
  const qc = useQueryClient();
  return useMutation<MailAccount, Error, string>({
    mutationFn: (id) => apiClients.comms.post<MailAccount>(`/mail-accounts/${id}/set-default`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mailAccountKeys.all });
      notify.success('Default mail account updated');
    },
    onError: (err) => notify.error('Failed to set default', err.message),
  });
}

export function useVerifyMailAccount() {
  const qc = useQueryClient();
  return useMutation<VerifyResult, Error, string>({
    mutationFn: (id) => apiClients.comms.post<VerifyResult>(`/mail-accounts/${id}/verify`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: mailAccountKeys.all });
      if (res.verified) notify.success('Connection verified');
      else notify.error('Verification failed', res.account.lastError ?? 'Could not connect.');
    },
    onError: (err) => notify.error('Verification failed', err.message),
  });
}
