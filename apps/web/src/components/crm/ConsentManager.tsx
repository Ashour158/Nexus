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
      <p className="text-sm text-slate-500">Sign in to view and edit consent preferences.</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-indigo-500" />
        <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
          Consent management
        </h3>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
        {CHANNELS.map((ch, i) => {
          const consent = consentMap.get(ch.key);
          const granted = consent?.status === 'GRANTED' && consent && !isExpired(consent);
          const expired = consent ? isExpired(consent) : false;

          return (
            <div
              key={ch.key}
              className={`flex items-center justify-between px-4 py-3 ${
                i > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{ch.icon}</span>
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {ch.label}
                  </p>
                  {consent ? (
                    <p className="mt-0.5 text-xs text-slate-400">
                      {granted &&
                        consent.grantedAt &&
                        `Granted ${new Date(consent.grantedAt).toLocaleDateString()}`}
                      {expired && <span className="text-amber-500">Expired</span>}
                      {consent.status === 'WITHDRAWN' && (
                        <span className="text-red-500">Withdrawn</span>
                      )}
                      {consent.source && ` · ${consent.source.toLowerCase()}`}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {expired ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : null}
                <button
                  type="button"
                  onClick={() =>
                    granted ? withdrawMutation.mutate(ch.key) : grantMutation.mutate(ch.key)
                  }
                  disabled={grantMutation.isPending || withdrawMutation.isPending}
                  className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    granted
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-red-50 hover:text-red-700 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-red-950/30 dark:hover:text-red-300'
                      : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-300'
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
