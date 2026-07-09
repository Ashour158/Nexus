'use client';

import Link from 'next/link';
import { ArrowRight, Play, Archive, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/hooks/use-confirm';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { notify } from '@/lib/toast';
import { useAuthStore } from '@/stores/auth.store';
import {
  useJourneys,
  useActivateJourney,
  useArchiveJourney,
  useDeleteJourney,
  type Journey,
  type JourneyStatus,
} from '@/hooks/use-command-center';

/**
 * Journeys — customer/record lifecycle orchestration.
 *
 * Wired to the workflow-service CommandCenter command-journey contract
 * (`/api/v1/command-center/journeys`) via `use-command-center` — the engine
 * with a live stepping scheduler + dev-preview mock. Rows link to the journey
 * detail at `/journeys/[id]`; "New" opens the create surface at `/journeys/new`.
 */

const STATUS_STYLES: Record<JourneyStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  ARCHIVED: 'bg-amber-100 text-amber-800',
};

/** The list endpoint returns a bare array in dev-mock and `{ items }` from the
 *  live service — normalize both (and defend against 404/empty). */
function toArray<T>(v: T[] | undefined): T[] {
  if (Array.isArray(v)) return v;
  const o = v as unknown as { items?: T[]; data?: T[] } | undefined;
  return o?.items ?? o?.data ?? [];
}

export default function JourneysPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canRead = hasPermission('workflows:read');
  const { confirm, ConfirmDialog } = useConfirm();

  const query = useJourneys();
  const activate = useActivateJourney();
  const archive = useArchiveJourney();
  const remove = useDeleteJourney();

  if (!canRead) {
    return (
      <main className="p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          You do not have permission to view journeys.
        </div>
      </main>
    );
  }

  const rows = toArray<Journey>(query.data);

  const handleActivate = (id: string) => {
    activate.mutate(id, {
      onSuccess: () => notify.success('Journey activated'),
      onError: (err) => notify.error('Failed to activate journey', err instanceof Error ? err.message : undefined),
    });
  };
  const handleArchive = (id: string) => {
    archive.mutate(id, {
      onSuccess: () => notify.success('Journey archived'),
      onError: (err) => notify.error('Failed to archive journey', err instanceof Error ? err.message : undefined),
    });
  };
  const handleDelete = async (id: string, name: string) => {
    if (!(await confirm(`Delete journey "${name}" and its enrollments?`, 'Delete Journey'))) return;
    remove.mutate(id, {
      onSuccess: () => notify.success('Journey deleted'),
      onError: (err) => notify.error('Delete failed', err instanceof Error ? err.message : undefined),
    });
  };

  return (
    <main className="space-y-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Journeys</h1>
          <p className="text-sm text-slate-600">
            Customer journey automation and orchestration.
          </p>
        </div>
        <Link href="/journeys/new">
          <Button type="button">New Journey</Button>
        </Link>
      </header>

      <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        {query.isLoading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : query.isError ? (
          <div className="p-4 text-sm text-red-600">Failed to load journeys.</div>
        ) : rows.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon="🛤️"
              title="No journeys yet"
              description="Create your first journey to automate a record lifecycle."
              cta={{ label: 'New Journey', href: '/journeys/new' }}
            />
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-start">Name</th>
                <th className="px-4 py-3 text-start">Entity</th>
                <th className="px-4 py-3 text-start">Entry Trigger</th>
                <th className="px-4 py-3 text-start">Status</th>
                <th className="px-4 py-3 text-end">Steps</th>
                <th className="px-4 py-3 text-end">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((j) => (
                <tr key={j.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/journeys/${j.id}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {j.name}
                    </Link>
                    {j.description && (
                      <p className="text-xs text-slate-500">{j.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-600">{j.entityType}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {j.entryTrigger?.event ? (
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                        {j.entryTrigger.event}
                      </code>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        STATUS_STYLES[j.status] ?? 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {j.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums text-slate-600">
                    {j.steps?.length ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {j.status !== 'ACTIVE' && (
                        <button
                          type="button"
                          onClick={() => handleActivate(j.id)}
                          disabled={activate.isPending}
                          className="rounded p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-40"
                          aria-label="Activate"
                          title="Activate"
                        >
                          <Play className="h-4 w-4" />
                        </button>
                      )}
                      {j.status !== 'ARCHIVED' && (
                        <button
                          type="button"
                          onClick={() => handleArchive(j.id)}
                          disabled={archive.isPending}
                          className="rounded p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600 disabled:opacity-40"
                          aria-label="Archive"
                          title="Archive"
                        >
                          <Archive className="h-4 w-4" />
                        </button>
                      )}
                      <Link
                        href={`/journeys/${j.id}`}
                        className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Open journey"
                        title="Open"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(j.id, j.name)}
                        disabled={remove.isPending}
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                        aria-label="Delete"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {ConfirmDialog}
    </main>
  );
}
