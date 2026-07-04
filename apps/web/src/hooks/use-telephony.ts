'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';

const api = apiClients.telephony;

export interface TelephonyCall {
  id: string;
  callId: string;
  callSid: string;
  toNumber: string;
  contactId?: string;
  dealId?: string;
  accountId?: string;
  status: string;
  direction: 'outbound' | 'inbound';
  startedAt: string;
  durationSeconds?: number;
}

export interface ClickToCallInput {
  toNumber: string;
  contactId?: string;
  dealId?: string;
  accountId?: string;
}

export interface ClickToCallResult {
  callId: string;
  callSid: string;
  status: string;
}

export interface CallHistoryFilter {
  contactId?: string;
  dealId?: string;
  accountId?: string;
}

/** Thrown when comm-service returns 503 requiresConfig (telephony not set up). */
export class TelephonyNotConfiguredError extends Error {
  constructor() {
    super('Telephony not configured');
    this.name = 'TelephonyNotConfiguredError';
  }
}

export const telephonyKeys = {
  all: ['telephony'] as const,
  calls: (filter: CallHistoryFilter) => [...telephonyKeys.all, 'calls', filter] as const,
};

export function useCallHistory(filter: CallHistoryFilter) {
  const enabled = Boolean(filter.contactId || filter.dealId || filter.accountId);
  return useQuery<TelephonyCall[]>({
    queryKey: telephonyKeys.calls(filter),
    queryFn: () =>
      api.get<TelephonyCall[]>('/calls', {
        params: {
          ...(filter.contactId ? { contactId: filter.contactId } : {}),
          ...(filter.dealId ? { dealId: filter.dealId } : {}),
          ...(filter.accountId ? { accountId: filter.accountId } : {}),
        },
      }),
    enabled,
  });
}

export function useClickToCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ClickToCallInput) => {
      try {
        return await api.post<ClickToCallResult>('/click-to-call', input);
      } catch (err) {
        const response = (err as { response?: { status?: number; data?: { error?: { requiresConfig?: boolean } } } })
          .response;
        if (response?.status === 503) {
          throw new TelephonyNotConfiguredError();
        }
        throw err;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: telephonyKeys.all }),
  });
}
