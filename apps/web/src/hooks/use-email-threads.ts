import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export interface EmailMessage {
  id: string;
  fromEmail: string;
  toEmails: string[];
  ccEmails: string[];
  subject: string;
  bodyHtml?: string | null;
  bodyText?: string | null;
  sentAt: string;
  direction: 'inbound' | 'outbound' | string;
}

export interface EmailThread {
  id: string;
  subject: string;
  snippet?: string | null;
  isRead: boolean;
  lastMessageAt: string;
  messageCount: number;
  messages?: EmailMessage[];
}

export function useContactEmailThreads(contactId: string) {
  return useQuery<EmailThread[]>({
    queryKey: ['contact-emails', contactId],
    queryFn: () => api.get<EmailThread[]>(`/contacts/${contactId}/email-threads`),
    enabled: Boolean(contactId),
  });
}

export function useAccountEmailThreads(accountId: string) {
  return useQuery<EmailThread[]>({
    queryKey: ['account-emails', accountId],
    queryFn: () => api.get<EmailThread[]>(`/accounts/${accountId}/email-threads`),
    enabled: Boolean(accountId),
  });
}
