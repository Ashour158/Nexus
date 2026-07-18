'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiClients } from '@/lib/api-client';
import { Button } from '@/components/ui/button';

type OAuthProvider = 'google' | 'microsoft';
type OAuthConnection = { id: string; provider: OAuthProvider; scope?: string };

export default function TeamsIntegrationPage() {
  const [rules, setRules] = useState([
    { id: 'r1', label: 'Deal won', channel: 'Sales Team', threshold: '', enabled: true },
    { id: 'r2', label: 'Deal lost', channel: 'Losses', threshold: '', enabled: false },
    { id: 'r3', label: 'New lead assigned', channel: 'Direct message', threshold: '', enabled: true },
  ]);

  const connections = useQuery({ queryKey: ['oauth-connections'], queryFn: () => apiClients.integration.get<OAuthConnection[]>('/integrations/oauth/connections') });
  const connected = useMemo(() => (connections.data ?? []).some((c) => c.provider === 'microsoft'), [connections.data]);
  const connect = useMutation({ mutationFn: async () => { const base = process.env.NEXT_PUBLIC_INTEGRATION_URL ?? 'http://localhost:3012/api/v1'; window.location.href = `${base}/integrations/oauth/microsoft/connect`; return Promise.resolve(); } });
  const disconnect = useMutation({ mutationFn: () => apiClients.integration.delete('/integrations/oauth/microsoft'), onSuccess: () => connections.refetch() });

  return (
    <main className="max-w-4xl space-y-4 p-4">
      <h1 className="text-2xl font-bold text-on-surface ">Teams Integration</h1>
      <section className="space-y-3 rounded-xl border border-outline-variant bg-surface p-4 dark:border-outline-variant dark:bg-surface">
        <div className="flex items-center justify-between"><p className="text-sm dark:text-outline">Status: <strong>{connected ? 'Connected' : 'Disconnected'}</strong></p>{connected ? <Button onClick={() => disconnect.mutate()} variant="secondary" className="border-error/40 text-error hover:bg-error-container dark:border-error/60 ">Disconnect</Button> : <Button onClick={() => connect.mutate()}>Connect with OAuth</Button>}</div>
        <h2 className="font-semibold text-on-surface ">Notification rules</h2>
        <div className="space-y-2">{rules.map((r, idx) => <div key={r.id} className="grid gap-2 rounded border border-outline-variant p-3 dark:border-outline-variant md:grid-cols-5"><label className="inline-flex items-center gap-2 text-sm dark:text-outline"><input type="checkbox" checked={r.enabled} onChange={(e) => setRules((prev) => prev.map((x, i) => i === idx ? { ...x, enabled: e.target.checked } : x))} />On</label><p className="text-sm dark:text-outline md:col-span-2">{r.label}</p><input value={r.channel} onChange={(e) => setRules((prev) => prev.map((x, i) => i === idx ? { ...x, channel: e.target.value } : x))} className="rounded border border-outline-variant bg-surface px-2 py-1 text-sm dark:border-outline-variant dark:bg-surface " placeholder="Channel" /></div>)}</div>
        <div className="flex justify-end pt-2">
          <Button onClick={() => {}} className="px-4">Save rules</Button>
        </div>
      </section>
    </main>
  );
}