'use client';

import { useMemo, useState, type JSX } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/format';
import { useUiStore } from '@/stores/ui.store';

interface Connection {
  id: string;
  provider: 'google' | 'microsoft';
  scope: string;
  expiresAt: string | null;
  updatedAt: string;
  createdAt: string;
}
interface SyncJob {
  id: string;
  connectionId: string;
  jobType: 'contacts_import' | 'deals_import' | 'contacts_export';
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  startedAt: string | null;
  completedAt: string | null;
}

const integrationUrl = (
  process.env.NEXT_PUBLIC_INTEGRATION_URL ?? 'http://localhost:3012'
).replace(/\/api\/v1\/?$/, '');

export default function IntegrationsPage(): JSX.Element {
  const qc = useQueryClient();
  const toast = useUiStore((s) => s.pushToast);
  const [showSyncForm, setShowSyncForm] = useState(false);
  const [connectionId, setConnectionId] = useState<string>('');
  const [jobType, setJobType] = useState<SyncJob['jobType']>('contacts_import');

  const connectionsQuery = useQuery({
    queryKey: ['integrations', 'connections'],
    queryFn: () =>
      apiClients.integration.get<Connection[]>(
        '/integrations/oauth/connections'
      ),
  });
  const jobsQuery = useQuery({
    queryKey: ['integrations', 'jobs'],
    queryFn: () => apiClients.integration.get<SyncJob[]>('/integrations/sync/jobs'),
  });

  const disconnect = useMutation({
    mutationFn: (p: 'google' | 'microsoft') =>
      apiClients.integration.delete(`/integrations/oauth/${p}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['integrations'] });
      toast({ variant: 'success', title: 'Disconnected provider' });
    },
  });
  const triggerSync = useMutation({
    mutationFn: () =>
      apiClients.integration.post('/integrations/sync/jobs', {
        connectionId,
        jobType,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['integrations', 'jobs'] });
      setShowSyncForm(false);
      toast({ variant: 'success', title: 'Sync started' });
    },
  });

  const connections = useMemo(() => connectionsQuery.data ?? [], [connectionsQuery.data]);
  const jobs = useMemo(() => jobsQuery.data ?? [], [jobsQuery.data]);
  const google = connections.find((connection) => connection.provider === 'google');
  const microsoft = connections.find((connection) => connection.provider === 'microsoft');

  return (
    <main className="space-y-4 p-4">
      <header>
        <h1 className="text-xl font-semibold">Integrations</h1>
        <p className="text-sm text-slate-500">Manage OAuth providers and sync jobs.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {[
          { key: 'google' as const, title: 'Google Workspace', short: 'G', connection: google },
          { key: 'microsoft' as const, title: 'Microsoft 365', short: 'M', connection: microsoft },
        ].map((providerCard) => (
          <article key={providerCard.key} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">{providerCard.short}</div>
                <div>
                  <h2 className="font-medium text-slate-900">{providerCard.title}</h2>
                  <p className={`text-xs ${providerCard.connection ? 'text-emerald-600' : 'text-slate-500'}`}>
                    {providerCard.connection ? 'Connected' : 'Not connected'}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-3 text-sm text-slate-600">
              <p>Scopes: {providerCard.connection?.scope ? providerCard.connection.scope.split(/[,\s]+/).filter(Boolean).join(', ') : '—'}</p>
              <p>Updated: {providerCard.connection?.updatedAt ? formatDateTime(providerCard.connection.updatedAt) : 'Never'}</p>
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  window.location.href = `${integrationUrl}/api/v1/integrations/oauth/${providerCard.key}/connect`;
                }}
              >
                Connect
              </Button>
              {providerCard.connection ? (
                <Button variant="ghost" onClick={() => disconnect.mutate(providerCard.key)} disabled={disconnect.isPending}>
                  Disconnect
                </Button>
              ) : null}
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium text-slate-900">Sync Jobs</h2>
          <Button variant="secondary" onClick={() => setShowSyncForm((value) => !value)}>
            Trigger Sync
          </Button>
        </div>
        {showSyncForm ? (
          <div className="mb-3 grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 md:grid-cols-3">
            <select value={connectionId} onChange={(e) => setConnectionId(e.target.value)} className="h-9 rounded-md border border-slate-300 px-3 text-sm">
              <option value="">Select connection</option>
              {connections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.provider} ({connection.id.slice(0, 8)}...)
                </option>
              ))}
            </select>
            <select value={jobType} onChange={(e) => setJobType(e.target.value as SyncJob['jobType'])} className="h-9 rounded-md border border-slate-300 px-3 text-sm">
              <option value="contacts_import">contacts_import</option>
              <option value="deals_import">deals_import</option>
              <option value="contacts_export">contacts_export</option>
            </select>
            <Button onClick={() => triggerSync.mutate()} disabled={triggerSync.isPending || !connectionId}>Start</Button>
          </div>
        ) : null}
        {jobsQuery.isLoading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : jobs.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No sync jobs yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr><th className="px-3 py-2">Provider</th><th>Type</th><th>Status</th><th>Started</th><th>Completed</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td className="px-3 py-2">{connections.find((connection) => connection.id === job.connectionId)?.provider ?? 'unknown'}</td>
                  <td>{job.jobType}</td>
                  <td><span className={`rounded-full px-2 py-0.5 text-xs ${job.status === 'RUNNING' ? 'bg-blue-100 text-blue-700' : job.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : job.status === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>{job.status}</span></td>
                  <td>{job.startedAt ? formatDateTime(job.startedAt) : '—'}</td>
                  <td>{job.completedAt ? formatDateTime(job.completedAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
