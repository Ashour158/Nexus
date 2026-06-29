'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiClients } from '@/lib/api-client';
import { Button } from '@/components/ui/button';

type OAuthProvider = 'google' | 'microsoft' | 'slack';

type OAuthConnection = { id: string; provider: OAuthProvider; scope?: string; connectedAt?: string; tenantId?: string; userId?: string };

function IntegrationRules({ providerName, oauthProvider }: { providerName: 'Slack' | 'Teams'; oauthProvider: OAuthProvider }) {
  const [rules, setRules] = useState([
    { id: 'r1', label: 'Deal won', channel: '#sales', threshold: '', enabled: true },
    { id: 'r2', label: 'Deal lost', channel: '#sales-losses', threshold: '', enabled: false },
    { id: 'r3', label: 'New lead assigned', channel: 'DM', threshold: '', enabled: true },
    { id: 'r4', label: 'Deal stalled', channel: 'DM to manager', threshold: '7', enabled: true },
    { id: 'r5', label: 'Task overdue', channel: 'DM', threshold: '', enabled: true },
    { id: 'r6', label: 'High-value deal created', channel: '#big-deals', threshold: '50000', enabled: true },
  ]);

  const connections = useQuery({ queryKey: ['oauth-connections'], queryFn: () => apiClients.integration.get<OAuthConnection[]>('/integrations/oauth/connections') });
  const connected = useMemo(() => (connections.data ?? []).some((c) => c.provider === oauthProvider), [connections.data, oauthProvider]);

  const connect = useMutation({
    mutationFn: async () => {
      const base = process.env.NEXT_PUBLIC_INTEGRATION_URL ?? 'http://localhost:3012/api/v1';
      window.location.href = `${base}/integrations/oauth/${oauthProvider}/connect`;
      return Promise.resolve();
    },
  });

  const disconnect = useMutation({
    mutationFn: () => apiClients.integration.delete(`/integrations/oauth/${oauthProvider}`),
    onSuccess: () => connections.refetch(),
  });

  return (
    <main className="max-w-4xl space-y-4 p-4">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{providerName} Integration</h1>
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between"><div><p className="text-sm dark:text-slate-300">OAuth connector: {oauthProvider}</p><p className="font-semibold dark:text-slate-100">{connected ? 'Connected' : 'Disconnected'}</p></div><div className="flex gap-2">{connected ? <Button onClick={() => disconnect.mutate()} variant="secondary" className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-500/60 dark:text-red-300 dark:hover:bg-red-950/30" disabled={disconnect.isPending}>Disconnect</Button> : <Button onClick={() => connect.mutate()}>Connect with OAuth</Button>}</div></div>
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Notification rules</h2>
        <div className="space-y-2">
          {rules.map((r, idx) => (
            <div key={r.id} className="grid gap-2 rounded border border-slate-200 p-3 dark:border-slate-700 md:grid-cols-5">
              <label className="inline-flex items-center gap-2 text-sm dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={(e) => setRules((prev) => prev.map((x, i) => i === idx ? { ...x, enabled: e.target.checked } : x))}
                />
                On
              </label>
              <p className="text-sm dark:text-slate-200 md:col-span-2">{r.label}</p>
              <input
                value={r.channel}
                onChange={(e) => setRules((prev) => prev.map((x, i) => i === idx ? { ...x, channel: e.target.value } : x))}
                placeholder="Channel"
                className="rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <input
                value={r.threshold}
                onChange={(e) => setRules((prev) => prev.map((x, i) => i === idx ? { ...x, threshold: e.target.value } : x))}
                placeholder="Threshold"
                className="rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={() => alert('Rules saved')}>Save rules</Button>
        </div>
      </section>
    </main>
  );
}

export default function SlackPage() {
  return <IntegrationRules providerName="Slack" oauthProvider="slack" />;
}