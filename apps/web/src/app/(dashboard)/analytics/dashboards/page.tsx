'use client';

import { type ReactElement, useState } from 'react';
import Link from 'next/link';
import { BarChart3, LayoutGrid, Plus, Share2, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useCreateDashboard, useDashboards, useDeleteDashboard } from '@/hooks/use-bi';

export default function DashboardsListPage(): ReactElement {
  const { data: dashboards, isLoading, error } = useDashboards();
  const createDashboard = useCreateDashboard();
  const deleteDashboard = useDeleteDashboard();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [shared, setShared] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    await createDashboard.mutateAsync({ name: name.trim(), description: description.trim() || undefined, shared });
    setShowCreate(false);
    setName('');
    setDescription('');
    setShared(false);
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Dashboards</h1>
          <p className="text-sm text-on-surface-variant">
            Build your own analytics with custom widgets, charts, and filters.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/analytics/reports/builder"
            className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-sm font-semibold text-on-surface hover:bg-surface-container-low"
          >
            <BarChart3 className="h-4 w-4" />
            Report builder
          </Link>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
          >
            <Plus className="h-4 w-4" />
            New dashboard
          </button>
        </div>
      </header>

      {isLoading ? (
        <div className="rounded-xl border border-outline-variant bg-surface p-10 text-center text-sm text-on-surface-variant">
          Loading dashboards…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-error/30 bg-error-container p-8 text-sm text-error">
          Failed to load dashboards. {(error as Error).message}
        </div>
      ) : !dashboards?.length ? (
        <EmptyState onCreate={() => setShowCreate(true)} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dashboards.map((dashboard) => (
            <div
              key={dashboard.id}
              className="group relative flex flex-col rounded-xl border border-outline-variant bg-surface p-5 shadow-sm transition hover:border-primary/40 hover:shadow"
            >
              <Link href={`/analytics/dashboards/${dashboard.id}`} className="flex-1">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-container text-primary">
                  <LayoutGrid className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-on-surface">{dashboard.name}</h3>
                {dashboard.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-on-surface-variant">{dashboard.description}</p>
                )}
                <div className="mt-3 flex items-center gap-3 text-xs text-on-surface-variant">
                  <span>{dashboard.widgets?.length ?? 0} widgets</span>
                  {dashboard.shared && (
                    <span className="inline-flex items-center gap-1 text-success">
                      <Share2 className="h-3 w-3" /> Shared
                    </span>
                  )}
                </div>
              </Link>
              <button
                onClick={() => {
                  if (confirm(`Delete "${dashboard.name}"?`)) deleteDashboard.mutate(dashboard.id);
                }}
                className="absolute right-3 top-3 rounded-md p-1.5 text-outline opacity-0 transition hover:bg-error-container hover:text-error group-hover:opacity-100"
                title="Delete dashboard"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface shadow-xl">
            <header className="flex items-center justify-between border-b border-outline-variant px-6 py-4">
              <h2 className="text-lg font-bold text-on-surface">New dashboard</h2>
              <button onClick={() => setShowCreate(false)} className="text-on-surface-variant hover:text-on-surface">
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="space-y-4 p-6">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  placeholder="e.g. Q3 Sales Review"
                  className="rounded-lg border border-outline-variant px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="rounded-lg border border-outline-variant px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-on-surface">
                <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
                Share with my team
              </label>
            </div>
            <footer className="flex items-center justify-end gap-3 border-t border-outline-variant px-6 py-4">
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!name.trim() || createDashboard.isPending}
                className={cn(
                  'rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary',
                  (!name.trim() || createDashboard.isPending) && 'opacity-50'
                )}
              >
                {createDashboard.isPending ? 'Creating…' : 'Create'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </main>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }): ReactElement {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant bg-surface p-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-container text-primary">
        <LayoutGrid className="h-7 w-7" />
      </div>
      <h3 className="text-lg font-bold text-on-surface">No dashboards yet</h3>
      <p className="mt-1 max-w-sm text-sm text-on-surface-variant">
        Create a dashboard and add your own widgets — pick a dataset, choose measures and
        dimensions, and render it as a chart.
      </p>
      <button
        onClick={onCreate}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
      >
        <Plus className="h-4 w-4" />
        New dashboard
      </button>
    </div>
  );
}
