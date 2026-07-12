'use client';

import { useMemo, useState, type JSX } from 'react';
import Link from 'next/link';
import { Plug, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge, type StatusVariant } from '@/components/ui/status-badge';
import { formatDateTime } from '@/lib/format';
import { useAuthStore } from '@/stores/auth.store';
import {
  useOAuthConnections,
  useSyncJobs,
  useDisconnectOAuth,
  useTriggerSync,
  connectOAuthUrl,
  type OAuthConnection,
  type SyncJob,
  type SyncJobStatus,
} from '@/hooks/use-integrations';

/**
 * Connections & Sync — live OAuth connections (provider, email, scopes, expiry,
 * last sync) with disconnect, plus sync-job triggering and history. Wired to
 * integration-service via `use-integrations` hooks. Gated on
 * `integrations:manage` for mutating actions.
 */

const JOB_STATUS_VARIANT: Record<SyncJobStatus, StatusVariant> = {
  PENDING: 'warning',
  RUNNING: 'info',
  COMPLETED: 'success',
  FAILED: 'danger',
};

const JOB_TYPES: SyncJob['jobType'][] = [
  'contacts_import',
  'deals_import',
  'contacts_export',
];

function scopeList(connection: OAuthConnection): string[] {
  if (connection.scopes?.length) return connection.scopes;
  if (connection.scope) return connection.scope.split(/[,\s]+/).filter(Boolean);
  return [];
}

export default function ConnectionsAndSyncPage(): JSX.Element {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission('integrations:manage');

  const connectionsQuery = useOAuthConnections();
  const jobsQuery = useSyncJobs();
  const disconnect = useDisconnectOAuth();
  const triggerSync = useTriggerSync();

  const [showSyncForm, setShowSyncForm] = useState(false);
  const [connectionId, setConnectionId] = useState('');
  const [jobType, setJobType] = useState<SyncJob['jobType']>('contacts_import');

  const connections = useMemo(
    () => connectionsQuery.data ?? [],
    [connectionsQuery.data]
  );
  const jobs = useMemo(() => jobsQuery.data ?? [], [jobsQuery.data]);

  const providerLabel = (id: string) =>
    connections.find((c) => c.id === id)?.provider ?? 'unknown';

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Connections &amp; Sync
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Manage connected OAuth providers and data sync jobs.
          </p>
        </div>
        <Link href="/settings/integrations">
          <Button variant="secondary" size="sm">
            <Plug className="h-4 w-4" />
            Browse connectors
          </Button>
        </Link>
      </header>

      {/* Connections */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Connected providers
        </h2>

        {connectionsQuery.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : connectionsQuery.isError ? (
          <EmptyState
            icon="⚠️"
            compact
            title="Couldn't load connections"
            cta={{ label: 'Retry', onClick: () => connectionsQuery.refetch() }}
          />
        ) : connections.length === 0 ? (
          <EmptyState
            icon="🔌"
            compact
            title="No providers connected"
            description="Connect a provider from the Integration Hub to start syncing."
            cta={{ label: 'Browse connectors', href: '/settings/integrations' }}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {connections.map((connection) => {
              const scopes = scopeList(connection);
              return (
                <article
                  key={connection.id}
                  className="rounded-xl border p-4"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold"
                        style={{ backgroundColor: '#eef6ff', color: '#4f46e5' }}
                      >
                        {connection.provider.charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <h3 className="font-medium capitalize" style={{ color: 'var(--text-primary)' }}>
                          {connection.provider}
                        </h3>
                        {connection.email ? (
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {connection.email}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <StatusBadge status="Connected" variant="success" />
                  </div>

                  <dl className="mt-3 space-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <div className="flex justify-between gap-2">
                      <dt>Last sync</dt>
                      <dd>
                        {connection.lastSyncAt
                          ? formatDateTime(connection.lastSyncAt)
                          : 'Never'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Expires</dt>
                      <dd>
                        {connection.expiresAt
                          ? formatDateTime(connection.expiresAt)
                          : '—'}
                      </dd>
                    </div>
                    {scopes.length ? (
                      <div className="pt-1">
                        <dt className="mb-1">Scopes</dt>
                        <dd className="flex flex-wrap gap-1">
                          {scopes.map((s) => (
                            <span
                              key={s}
                              className="rounded bg-surface-container-high px-1.5 py-0.5 text-[10px] text-on-surface-variant"
                            >
                              {s}
                            </span>
                          ))}
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!canManage}
                      onClick={() => {
                        window.location.href = connectOAuthUrl(connection.provider);
                      }}
                    >
                      Reconnect
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-error hover:bg-error-container"
                      disabled={!canManage}
                      isLoading={disconnect.isPending}
                      onClick={() => disconnect.mutate(connection.provider)}
                    >
                      Disconnect
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Sync jobs */}
      <section
        className="rounded-xl border p-4"
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border-color)',
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Sync jobs
          </h2>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => jobsQuery.refetch()}
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!canManage || connections.length === 0}
              onClick={() => setShowSyncForm((v) => !v)}
            >
              Trigger sync
            </Button>
          </div>
        </div>

        {showSyncForm ? (
          <div className="mb-3 grid gap-2 rounded-md border border-outline-variant bg-surface-container-low p-3 md:grid-cols-3">
            <select
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              className="h-9 rounded-md border border-outline-variant px-3 text-sm"
            >
              <option value="">Select connection</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.provider} ({c.id.slice(0, 8)}…)
                </option>
              ))}
            </select>
            <select
              value={jobType}
              onChange={(e) => setJobType(e.target.value as SyncJob['jobType'])}
              className="h-9 rounded-md border border-outline-variant px-3 text-sm"
            >
              {JOB_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={!connectionId || triggerSync.isPending}
              isLoading={triggerSync.isPending}
              onClick={() =>
                triggerSync.mutate(
                  { connectionId, jobType },
                  { onSuccess: () => setShowSyncForm(false) }
                )
              }
            >
              Start
            </Button>
          </div>
        ) : null}

        {jobsQuery.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState icon="🔄" compact title="No sync jobs yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-start text-xs uppercase" style={{ color: 'var(--text-muted)' }}>
                <tr className="border-b border-outline-variant">
                  <th className="px-3 py-2 text-left">Provider</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Started</th>
                  <th className="px-3 py-2 text-left">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="px-3 py-2 capitalize">{providerLabel(job.connectionId)}</td>
                    <td className="px-3 py-2">{job.jobType}</td>
                    <td className="px-3 py-2">
                      <StatusBadge
                        status={job.status}
                        variant={JOB_STATUS_VARIANT[job.status] ?? 'neutral'}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {job.startedAt ? formatDateTime(job.startedAt) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {job.completedAt ? formatDateTime(job.completedAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
