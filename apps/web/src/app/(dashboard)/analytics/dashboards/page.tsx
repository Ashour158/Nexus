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
          <h1 className="text-2xl font-bold text-slate-900">Dashboards</h1>
          <p className="text-sm text-slate-500">
            Build your own analytics with custom widgets, charts, and filters.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/analytics/reports/builder"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <BarChart3 className="h-4 w-4" />
            Report builder
          </Link>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            New dashboard
          </button>
        </div>
      </header>

      {isLoading ? (
        <div className="rounded-xl border border-slate-100 bg-white p-10 text-center text-sm text-slate-500">
          Loading dashboards…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-100 bg-rose-50 p-8 text-sm text-rose-700">
          Failed to load dashboards. {(error as Error).message}
        </div>
      ) : !dashboards?.length ? (
        <EmptyState onCreate={() => setShowCreate(true)} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dashboards.map((dashboard) => (
            <div
              key={dashboard.id}
              className="group relative flex flex-col rounded-xl border border-slate-100 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow"
            >
              <Link href={`/analytics/dashboards/${dashboard.id}`} className="flex-1">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <LayoutGrid className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">{dashboard.name}</h3>
                {dashboard.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">{dashboard.description}</p>
                )}
                <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
                  <span>{dashboard.widgets?.length ?? 0} widgets</span>
                  {dashboard.shared && (
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <Share2 className="h-3 w-3" /> Shared
                    </span>
                  )}
                </div>
              </Link>
              <button
                onClick={() => {
                  if (confirm(`Delete "${dashboard.name}"?`)) deleteDashboard.mutate(dashboard.id);
                }}
                className="absolute right-3 top-3 rounded-md p-1.5 text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
                title="Delete dashboard"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">New dashboard</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="space-y-4 p-6">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  placeholder="e.g. Q3 Sales Review"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
                Share with my team
              </label>
            </div>
            <footer className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!name.trim() || createDashboard.isPending}
                className={cn(
                  'rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700',
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
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
        <LayoutGrid className="h-7 w-7" />
      </div>
      <h3 className="text-lg font-bold text-slate-900">No dashboards yet</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        Create a dashboard and add your own widgets — pick a dataset, choose measures and
        dimensions, and render it as a chart.
      </p>
      <button
        onClick={onCreate}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
      >
        <Plus className="h-4 w-4" />
        New dashboard
      </button>
    </div>
  );
}
