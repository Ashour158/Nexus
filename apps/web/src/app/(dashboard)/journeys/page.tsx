'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/hooks/use-confirm';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  useJourneys,
  useActivateJourney,
  usePauseJourney,
  useArchiveJourney,
  useDeleteJourney,
  type Journey,
} from '@/hooks/use-journeys';
import { notify } from '@/lib/toast';
import { useAuthStore } from '@/stores/auth.store';

export default function JourneysPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canRead = hasPermission('workflows:read');
  const { confirm, ConfirmDialog } = useConfirm();
  const [page, setPage] = useState(1);
  const query = useJourneys({ page, limit: 25 });
  const activate = useActivateJourney();
  const pause = usePauseJourney();
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

  const rows = query.data?.data ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = query.data?.totalPages ?? 1;

  function toggleStatus(journey: Journey) {
    if (journey.status === 'ACTIVE') {
      pause.mutate(journey.id, {
        onSuccess: () => notify.success('Journey paused'),
        onError: (err) => notify.error('Failed to pause journey', err.message),
      });
    } else if (journey.status === 'PAUSED' || journey.status === 'DRAFT') {
      activate.mutate(journey.id, {
        onSuccess: () => notify.success('Journey activated'),
        onError: (err) => notify.error('Failed to activate journey', err.message),
      });
    }
  }

  return (
    <main className="space-y-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Journeys</h1>
          <p className="text-sm text-slate-600">
            Customer journey automation and orchestration.
          </p>
        </div>
        <Link href="/workflows/new">
          <Button type="button">New Journey</Button>
        </Link>
      </header>

      <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        {query.isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : query.isError ? (
          <div className="p-4 text-sm text-red-600">Failed to load journeys.</div>
        ) : rows.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon="🛤️"
              title="No journeys yet"
              description="Create your first customer journey to automate engagement."
            />
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Entry Trigger</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-end">Enrolled</th>
                <th className="px-4 py-3 text-end">Conversion</th>
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
                  <td className="px-4 py-3 text-slate-600">{j.entryTrigger}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={j.status} />
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {j.enrolledCount ?? 0}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {j.conversionRate != null
                      ? `${(j.conversionRate * 100).toFixed(1)}%`
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {(j.status === 'DRAFT' || j.status === 'PAUSED') && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => toggleStatus(j)}
                          disabled={activate.isPending || pause.isPending}
                        >
                          Activate
                        </Button>
                      )}
                      {j.status === 'ACTIVE' && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => toggleStatus(j)}
                          disabled={activate.isPending || pause.isPending}
                        >
                          Pause
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          archive.mutate(j.id, {
                            onSuccess: () => notify.success('Journey archived'),
                            onError: (err) => notify.error('Archive failed', err.message),
                          })
                        }
                        disabled={archive.isPending}
                      >
                        Archive
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={async () => {
                          if (await confirm(`Delete journey "${j.name}"?`, 'Delete Journey')) {
                            remove.mutate(j.id, {
                              onSuccess: () => notify.success('Journey deleted'),
                              onError: (err) => notify.error('Delete failed', err.message),
                            });
                          }
                        }}
                        disabled={remove.isPending}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {totalPages > 1 && (
        <footer className="flex items-center justify-between text-sm">
          <p className="text-slate-500">
            {rows.length} shown / {total} total
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-slate-600">
              Page {page} / {totalPages}
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </footer>
      )}
      {ConfirmDialog}
    </main>
  );
}

function StatusPill({ status }: { status: Journey['status'] }) {
  const cls: Record<string, string> = {
    DRAFT: 'bg-slate-100 text-slate-700',
    ACTIVE: 'bg-emerald-100 text-emerald-800',
    PAUSED: 'bg-amber-100 text-amber-800',
    ARCHIVED: 'bg-slate-200 text-slate-700',
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
        cls[status] ?? 'bg-slate-100 text-slate-700'
      }`}
    >
      {status}
    </span>
  );
}
