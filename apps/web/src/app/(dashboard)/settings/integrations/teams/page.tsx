'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiClients } from '@/lib/api-client';

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
      <h1 className="text-2xl font-bold text-slate-900">Teams Integration</h1>
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between"><p className="text-sm">Status: <strong>{connected ? 'Connected' : 'Disconnected'}</strong></p>{connected ? <button onClick={() => disconnect.mutate()} className="rounded border border-red-300 px-3 py-2 text-sm text-red-700">Disconnect</button> : <button onClick={() => connect.mutate()} className="rounded bg-blue-600 px-3 py-2 text-sm text-white">Connect with OAuth</button>}</div>
        <h2 className="font-semibold text-slate-900">Notification rules</h2>
        <div className="space-y-2">{rules.map((r, idx) => <div key={r.id} className="grid gap-2 rounded border border-slate-200 p-3 md:grid-cols-5"><label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={r.enabled} onChange={(e) => setRules((prev) => prev.map((x, i) => i === idx ? { ...x, enabled: e.target.checked } : x))} />On</label><p className="text-sm md:col-span-2">{r.label}</p><input value={r.channel} onChange={(e) => setRules((prev) => prev.map((x, i) => i === idx ? { ...x, channel: e.target.value } : x))} className="rounded border border-slate-300 px-2 py-1 text-sm" /><input value={r.threshold} onChange={(e) => setRules((prev) => prev.map((x, i) => i === idx ? { ...x, threshold: e.target.value } : x))} placeholder="Threshold" className="rounded border border-slate-300 px-2 py-1 text-sm" /></div>)}</div>
      </section>
    </main>
  );
}
