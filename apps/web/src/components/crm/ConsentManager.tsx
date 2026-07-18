'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Shield, Check, X, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

type ConsentRecord = {
  id: string;
  channel: string;
  status: string;
  grantedAt?: string;
  expiresAt?: string;
  source?: string;
};

const CHANNELS = [
  { key: 'EMAIL', label: 'Email marketing', icon: '📧' },
  { key: 'SMS', label: 'SMS messages', icon: '💬' },
  { key: 'WHATSAPP', label: 'WhatsApp', icon: '📱' },
  { key: 'PHONE', label: 'Phone calls', icon: '📞' },
  { key: 'MARKETING', label: 'Marketing profiling', icon: '🎯' },
  { key: 'PROFILING', label: 'Data profiling', icon: '🔍' },
];

export function ConsentManager({ contactId }: { contactId: string }) {
  const qc = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const tenantId = useAuthStore((s) => s.tenantId);

  const authHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (accessToken) authHeaders.Authorization = `Bearer ${accessToken}`;
  if (tenantId) authHeaders['x-tenant-id'] = tenantId;

  const { data: consents = [] } = useQuery<ConsentRecord[]>({
    queryKey: ['consents', contactId],
    enabled: Boolean(contactId && accessToken),
    queryFn: async () => {
      const r = await fetch(`/api/crm/contacts/${contactId}/consents`, {
        headers: authHeaders,
      });
      const j = (await r.json()) as { success?: boolean; data?: ConsentRecord[] };
      return j.data ?? [];
    },
  });

  const grantMutation = useMutation({
    mutationFn: (channel: string) =>
      fetch(`/api/crm/contacts/${contactId}/consents`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ channel, source: 'MANUAL' }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consents', contactId] }),
  });

  const withdrawMutation = useMutation({
    mutationFn: (channel: string) =>
      fetch(`/api/crm/contacts/${contactId}/consents/${channel}`, {
        method: 'DELETE',
        headers: authHeaders,
        body: JSON.stringify({ reason: 'Manual withdrawal by user' }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consents', contactId] }),
  });

  const consentMap = new Map(consents.map((c) => [c.channel, c]));

  const isExpired = (consent: ConsentRecord) =>
    consent.expiresAt ? new Date(consent.expiresAt) < new Date() : false;

  if (!accessToken) {
    return (
      <p className="text-sm text-on-surface-variant">Sign in to view and edit consent preferences.</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm text-on-surface ">
          Consent management
        </h3>
      </div>
      <div className="overflow-hidden rounded-xl border border-outline-variant dark:border-outline-variant">
        {CHANNELS.map((ch, i) => {
          const consent = consentMap.get(ch.key);
          const granted = consent?.status === 'GRANTED' && consent && !isExpired(consent);
          const expired = consent ? isExpired(consent) : false;

          return (
            <div
              key={ch.key}
              className={`flex items-center justify-between px-4 py-3 ${
                i > 0 ? 'border-t border-outline-variant dark:border-outline-variant' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{ch.icon}</span>
                <div>
                  <p className="text-sm font-medium text-on-surface dark:text-outline">
                    {ch.label}
                  </p>
                  {consent ? (
                    <p className="mt-0.5 text-xs text-on-surface-variant">
                      {granted &&
                        consent.grantedAt &&
                        `Granted ${new Date(consent.grantedAt).toLocaleDateString()}`}
                      {expired && <span className="text-warning">Expired</span>}
                      {consent.status === 'WITHDRAWN' && (
                        <span className="text-error">Withdrawn</span>
                      )}
                      {consent.source && ` · ${consent.source.toLowerCase()}`}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {expired ? <AlertTriangle className="h-4 w-4 text-warning" /> : null}
                <button
                  type="button"
                  onClick={() =>
                    granted ? withdrawMutation.mutate(ch.key) : grantMutation.mutate(ch.key)
                  }
                  disabled={grantMutation.isPending || withdrawMutation.isPending}
                  className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    granted
                      ? 'bg-success-container text-success hover:bg-error-container hover:text-error '
                      : 'bg-surface-container-high text-on-surface-variant hover:bg-primary-container hover:text-primary dark:bg-surface-container-high dark:text-on-surface-variant '
                  }`}
                >
                  {granted ? (
                    <>
                      <Check className="h-3 w-3" /> Withdraw
                    </>
                  ) : (
                    <>
                      <X className="h-3 w-3" /> Grant
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
